var {RtmClient, RTM_EVENTS, WebClient} = require('@slack/client');
var token = process.env.SLACK_SECRET || '';
var web = new WebClient(token);
var rtm = new RtmClient(token);

var  {User, Reminder, Meeting} = require('./models');

var axios = require('axios');
var moment = require('moment');
var _ = require('underscore');
moment().format();

var obj = {
  "attachments": [
    {
      "text": "Is this ok?",
      "fallback": "",
      "callback_id": "wopr_game",
      "color": "#3AA3E3",
      "attachment_type": "default",
      "actions": [
        {
          "name": "confrim",
          "text": "Yes",
          "type": "button",
          "value": "yes"
        },
        {
          "name": "confirm",
          "text": "Cancel",
          "type": "button",
          "value": "cancel"
        },
      ]
    }
  ]
}

var {validate} = require('./validate');
var { checkAccessToken } = require('./functions');

var taskHandler = function({result}, message, state){

  if(result.parameters.date && result.parameters.subject){
    state.date = result.parameters.date; state.subject = result.parameters.subject;
    obj.attachments[0].text = `Create task to ${state.subject} on ${state.date}`;
    web.chat.postMessage(message.channel, "Scheduler Bot", obj,function(err, res) {
      if (err) {
        console.log('Error:', err);
      } else {
        console.log('Message sent: ', res);
      }
    });
  } else if(result.parameters.subject){
    state.subject = result.parameters.subject;
    rtm.sendMessage(result.fulfillment.speech, message.channel);
  } else if(result.parameters.date){
    state.date = result.parameters.date;
    rtm.sendMessage(result.fulfillment.speech, message.channel);
  }else{
    rtm.sendMessage(result.fulfillment.speech, message.channel);
  }
  return state;
}

var taskFunction = function(data, message, user){
  console.log("entered taskFunction");
  var state = user.pendingState;
  if(!state.date || !state.subject){
      state = taskHandler(data, message, state);
  } else if(state.date && state.subject){
    rtm.sendMessage("Reply to previous task status", message.channel);
  } else {
    state = taskHandler(data, message, state);
  }
  user.pendingState = state ;
  user.save();
}

var setTask = function(user, message){
  console.log("entered setTask");
  var temp = encodeURIComponent(message.text);

  axios.get(`https://api.api.ai/api/query?v=20150910&query=${temp}&lang=en&sessionId=${message.user}`, {
    "headers": {
      "Authorization":"Bearer 678861ee7c0d455287f791fd46d1b344"
    },
  })
  .then(function({data}){
    taskFunction(data, message, user);
  })
}

var meetingHandler = function({result}, message, user){

  var state = user.pendingState;
  if(result.parameters.date && result.parameters.time && result.parameters.invitees[0]){
    if(result.parameters.subject){
      state.subject = result.parameters.subject;
    }
    state.date = result.parameters.date;
    state.time = result.parameters.time;
    state.invitees = result.parameters.invitees;
    return {state: state, status: true}
  }
  else{
    if(result.parameters.subject){
      state.subject = result.parameters.subject;
    }
    if(result.parameters.date){
      state.date = result.parameters.date;
    }
    if(result.parameters.time){
      state.time = result.parameters.time;
    }
    if(result.parameters.invitees[0]){
      state.invitees = result.parameters.invitees;
    }
    rtm.sendMessage(result.fulfillment.speech, message.channel);
    return {state: state, status: false};
  }
}

var meetingFunction = function(data, message, user){
  console.log("reached meetingFunction");
  var state = user.pendingState;
  if(!state.date || !state.invitees[0] || !state.time){
    state = meetingHandler(data, message, user).state;
    status = meetingHandler(data, message, user).status;
  } else if(state.date && state.time && state.invitees[0]){
    rtm.sendMessage("Reply to previous task status", message.channel);
    return;
  } else {
    state = meetingHandler(data, message, user).state;
    status = meetingHandler(data, message, user).status;
  }
  user.pendingState = state;
  user.save(function(err, user){
    if(!status){
      console.log("status is false and asking user for more info");
      return;
    }
    else{
      console.log("status is true and entering validation");
      validate(user, message);
    }
  });
}

var setString = function(myString, state){
  var myArray = myString.split(' ');
  myArray.forEach(function(item,index){
    if(item[0]==='<'){
      item = item.substring(2,item.length-1);
      state.inviteesBySlackid.push(item);
      myArray[index] = rtm.dataStore.getUserById(item).real_name;
    }
  });
  console.log("in setString function", myArray.join(' '));
  return myArray.join(' ');
}

var setMeeting = function(user, message){
  console.log("entered setMeeting function");
  var reqString = message.text;
  var promise = Promise.resolve(user);

  if(message.text.indexOf('with') !== -1){
    console.log("invitees have been provided, setting state and reqString");
    reqString = setString(message.text , user.pendingState);
    promise = user.save();
  }

  promise
  .then(function(user){
    console.log("entered the promise after settingstring and saving user");
    var temp = encodeURIComponent(reqString);
    axios.get(`https://api.api.ai/api/query?v=20150910&query=${temp}&lang=en&sessionId=${message.user}`, {
      "headers": {
        "Authorization":"Bearer 678861ee7c0d455287f791fd46d1b344"
      },
    })
    .then(function({data}){
      console.log("sending to meetingFunction");
      meetingFunction(data, message, user);
    })
  })
}

var mainResponseFunction = function(user, message){
  console.log("reached main response function");
  if(user.active===0){
    console.log("user was not active checking if reminder or meeting");
    if(message.text.indexOf('remind') !== -1){
      console.log("user wants task setting active=1");
      user.active = 1;
    }else if(message.text.indexOf('meeting') !== -1){
      console.log("user wants meeting setting active=2");
      user.active = 2;
    }else {
      console.log("user is wasting time");
      //sendNormalResponse(message);
      return;
    }
  }

  if(user.active===1){
    console.log("sending to setTask");
    setTask(user, message);
  }else {
    console.log("sending to setMeeting");
    setMeeting(user, message);
  }

}

rtm.on(RTM_EVENTS.MESSAGE, function handleRtmMessage(message){

  var dm = rtm.dataStore.getDMByUserId(message.user);

  if (!dm || dm.id !== message.channel || message.type !== 'message') {
    return;
  }

  var slackUser = rtm.dataStore.getUserById(message.user);

  User.findOne({slack_ID : message.user})
  .then(function(user){
    if(!user){
      console.log("did not find user creating one");
      var user = new User({
       // default_meeting_len: 30,
        slack_ID: message.user,
        slack_Username: slackUser.profile.real_name,
        slack_Email: slackUser.profile.email,
        slack_DM_ID: message.channel,
        active: 0
      })
      return user.save();
    }
    else{
      console.log("did find user checking if active or not.");
      if(user.active !== 0){
        console.log("user was active sending to mainResponseFunction");
        mainResponseFunction(user, message);
        return;
      }
      else{
        console.log("user was not active");
        return user;
      }
    }
  })
  .then(function(user){
    console.log("user was not active checking if has google auth or not.");
    if(user){
      if(!user.googleAccount.access_token){
        console.log("user does not have google auth");
        web.chat.postMessage(message.channel,
          'Use this link to give access to your google cal account ' + process.env.DOMAIN + '/connect?auth_id='
          + user._id);
          return;
        }
        else {
          console.log("user was not active but has google auth now sending to mainResponseFunction");
          if(user){
            user = checkAccessToken(user);
            mainResponseFunction(user, message);
          }
          else return;
        }
      }
    })
    .catch(function(err){
      console.log(err);
    })
});

module.exports = {
    rtm,
    web,
  }
