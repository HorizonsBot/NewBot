var { RtmClient, RTM_EVENTS, WebClient } = require('@slack/client');
var token = process.env.SLACK_SECRET || '';
var web = new WebClient(token);
var rtm = new RtmClient(token);

var { User, Reminder, Meeting } = require('./models');

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

var { checkAccessToken } = require('./functions')
var { validate } = require('./validate')

var taskHandler = function( { result }, message, state ){

  if(result.parameters.date && result.parameters.subject){
    state.date = result.parameters.date; state.subject = result.parameters.subject;
    obj.attachments[0].text = `Create reminder for Task: ${state.subject} on ${state.date}`;
    web.chat.postMessage(message.channel, "Scheduler Bot", obj, function(err, res) {
      if (err) {
        console.log('Error:', err);
      } else {
        console.log('Message sent: ', res);
      }
    });
  // } else if(result.parameters.subject){
  //   state.subject = result.parameters.subject;
  //   rtm.sendMessage(result.fulfillment.speech, message.channel);
  // } else if(result.parameters.date){
  //   state.date = result.parameters.date;
  //   rtm.sendMessage(result.fulfillment.speech, message.channel);
  // }else{
  //   rtm.sendMessage(result.fulfillment.speech, message.channel);
  // }
} else {
  state.subject = result.parameters.subject;
  state.date = result.parameters.date;
  rtm.sendMessage(result.fulfillment.speech, message.channel);
}
  return state;
}

var taskFunction = function(data, message, user){
  var state = user.pendingState;
  if(!state.date || !state.subject){
      state = taskHandler(data, message, state);
  } else if(state.date && state.subject){
    rtm.sendMessage("Reply to previous task status", message.channel);
  } else {
    state = taskHandler(data, message, state);
  }
  var promise = Promise.resolve(user);
  promise.then((user) => {
    user.pendingState = state;
    return user;
  })
  .then((user) => (user.save()))
  .catch((err) => {
    console.log("Error in tashFunction!!", err);
  })
}

var setTask = function(user, message){

  axios.get('https://api.api.ai/api/query', {
    params: {
      v: 20150910,
      lang: 'en',
      query: message.text,
      sessionId: message.user
    },
    headers: {
      Authorization: `Bearer ${process.env.API_AI_TOKEN}`
    }
  })
  .then(({ data }) => {
    taskFunction(data, message, user);
  })
  .catch((err) => {
    console.log("Error in setTask function!!", err);
  })
}

var meetingHandler = function( { result }, message, user){

  var state = user.pendingState;
  if(result.parameters.date && result.parameters.time && result.parameters.invitees[0]){
    state.date = result.parameters.date;
    state.time = result.parameters.time;
    state.invitees = result.parameters.invitees;
    return {state: state, status: true}
  } else {
    // if(result.parameters.subject){
    //   state.subject = result.parameters.subject;
    // }
    // if(result.parameters.date){
    //   state.date = result.parameters.date;
    // }
    // if(result.parameters.time){
    //   state.time = result.parameters.time;
    // }
    // if(result.parameters.invitees[0]){
    //   state.invitees = result.parameters.invitees;
    // }
    state.subject = result.parameters.subject;
    state.date = result.parameters.date;
    state.time = result.parameters.time;
    state.invitees = result.parameters.invitees;
    rtm.sendMessage(result.fulfillment.speech, message.channel);
    return { state: state, status: false};
  }
}

var meetingFunction = function(data, message, user){
  var state = user.pendingState;
  var status;
  if(state.date && state.time && state.invitees[0]){     // all required sys.params are present
    rtm.sendMessage("Reply to previous task status", message.channel);
    return;
  } else {
    state = meetingHandler(data, message, user).state;
    status = meetingHandler(data, message, user).status;
  }
  // if(!state.date || !state.invitees[0] || !state.time){
  //   state = meetingHandler(data, message, user).state;
  //   status = meetingHandler(data, message, user).status;
  // } else if(state.date && state.time && state.invitees[0]){
  //   rtm.sendMessage("Reply to previous task status", message.channel);
  //   return;
  // } else {     //REPETITION???? ***********************************************************
  //   state = meetingHandler(data, message, user).state;     //no async involved in meetingHandler
  //   status = meetingHandler(data, message, user).status;    //true if all required sys.parameters are present; false if else
  // }

  var promise = Promise.resolve(user);
  promise.then((user) => {
    console.log("USER 1", user);
    user.pendingState = state;
    return user;
  })
  .then((user) => (user.save()))
  .then((user) => {
    // console.log("USER 2", user);
    if(!status){
      console.log("status is false and asking user for more info");
      return;
    }
    else{
      console.log("status is true and entering validation");
      // console.log("USER 3", user);
      validate(user, message);
    }
  })
  .catch((err) => {
    console.log("Error in meetingFunction!!", err);
  })
}

// var setString = function(myString, state){
  // var myArray = myString.split(' ');
  // myArray.forEach(function(item, index){
  //   if(item[0]==='<'){
  //     item = item.substring(2,item.length-1);
  //     state.inviteesBySlackid.push(item);
  //     myArray[index] = rtm.dataStore.getUserById(item).real_name;
  //   }
  // });
  // return myArray.join(' ');
  // var regex = /<@\w+>/g;
// }

var setMeeting = function(user, message){
  console.log("entered setMeeting function");
  var reqString = message.text;
  var promise = Promise.resolve(user);

  if(message.text.indexOf('with') !== -1){
    console.log("invitees have been provided, setting state and reqString");
    var regex = /<@\w+>/g;
    message.text = message.text.replace(regex, function(match) {
      var userId = match.slice(2, -1);
      user.pendingState.inviteesBySlackid.push(userId);
      var invitee = rtm.dataStore.getUserById(userId);
      console.log("SLACK USERS", userId, invitee);
      return invitee.profile.first_name || invitee.profile.real_name;
    })

    // reqString = setString(message.text, user.pendingState);
    promise = user.save();
  }

  promise
  .then(function(user){
    axios.get('https://api.api.ai/api/query', {
      params: {
        v: 20150910,
        lang: 'en',
        query: message.text,
        sessionId: message.user
      },
      headers: {
        Authorization: `Bearer ${process.env.API_AI_TOKEN}`
      }
    })
    .then(function({data}){
      console.log("DATA from API.AI for SETMEETING, invitees", data.result.parameters.invitees);
      meetingFunction(data, message, user);
    })
    .catch((err) => {
      console.log("Error in setMeeting function", err);
    });
  })
}

//see what the user wants to do;
//user.active === 0 => created user for requester, not sure what requester wants to do (not reminder/meeting)
//user.active === 1 => requester wants to set reminder
//user.active === 2 => requester wants to schedule a meeting
var mainResponseFunction = function(user, message){
  console.log("reached main response function");
  if(user.active === 0){
    console.log("user was not active checking if reminder or meeting");
    if(message.text.indexOf('remind') !== -1){
      console.log("user wants reminder setting active=1");
      user.active = 1;
    }else if(message.text.indexOf('meeting') !== -1){
      console.log("user wants meeting setting active=2");
      user.active = 2;
    }else {
      console.log("user is wasting time");
      // sendNormalResponse(message);
      return;
    }
  }

  if(user.active===1){
    console.log("sending to setTask");
    setTask(user, message);
    //setTask => taskFunction => taskhandler
  } else {
    console.log("sending to setMeeting");
    setMeeting(user, message);
    //setMeeting => meetingFunction => meetinghandler
  }

}


rtm.on(RTM_EVENTS.MESSAGE, function handleRtmMessage(message){

  var dm = rtm.dataStore.getDMByUserId(message.user);
  if (!dm || dm.id !== message.channel || message.type !== 'message') return;

  var slackUser = rtm.dataStore.getUserById(message.user);

  User.findOne({slack_ID : message.user})
  .then(function(user){
    if(!user){
      console.log("did not find user creating one");
      var user = new User({
        slack_ID: message.user,
        slack_Username: slackUser.profile.real_name,
        slack_Email: slackUser.profile.email,
        slack_DM_ID: message.channel,
        active: 0
      }).save();
      return user;
    }
    else{
      console.log("USER IS", user);
      console.log("USER ACCESS TOKEN EXPIRY DATE", new Date(user.googleAccount.expiry_date));
      console.log("FOUND USER in handleRtmMessage checking if active or not.");
      if(user.active !== 0){
        console.log("user.active !== 0, sending to mainResponseFunction to handle user requests");
        mainResponseFunction(user, message);
        return;    //Skip the next .then
      }
      else{
        console.log("user.active === 0, user was not active");
        return user;     //enter the next .then
      }
    }
  })
  .then(function(user){
    console.log("user was not active checking if has google auth or not.");
    if(user){
      if(!user.googleAccount.access_token){
        console.log("user has not granted Google calendar access");
        rtm.sendMessage("Hello This is Scheduler bot. In order to schedule reminders for you, I need access to you Google calendar", message.channel);
        web.chat.postMessage(message.channel,
          'Use this link to give access to your google cal account ' + process.env.DOMAIN + '/connect?auth_id='
          + user._id);
          return;
        } else {    //user has access_token in MongoDB, check if expired
          checkAccessToken(user);
          mainResponseFunction(user, message);
          // console.log("user was not active but has google auth now sending to mainResponseFunction");
          // if(user) mainResponseFunction(user, message);
          // else return;
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
