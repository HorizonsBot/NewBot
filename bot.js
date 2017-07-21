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
    rtm.sendMessage(result.fulfillment.speech, message.channel)
  }
  return state;
}

var taskFunction = function(data, message, user){
  var state = user.pendingState
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

var taskPath = function (user) {

    if(user){
      var state = user.pendingState;
      var new_event = {
        "end": {
          "date": state.date
        },
        "start": {
          "date": state.date
        },
        "description": "Chief Keef is a fucking legend",
        "summary": state.subject
      }
      return axios.post(`https://www.googleapis.com/calendar/v3/calendars/primary/events?access_token=${user.googleAccount.access_token}`, new_event)
      .then(function(response){

        var reminder = new Reminder({
          subject: state.subject,
          day: state.date,
          googCalID: user.googleAccount.profile_ID,
          reqID: user.slack_ID
        })

        reminder.save(function(err) {
          if(err) {
            console.log('there is an error', err);
          } else {
            console.log('saved reminder in mongo');
          }
        });

        if(response.status === 200){
          return true;
        }else{
          return false;
        }

      })
      .catch(function(err){
        console.log(err);
      })
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

    // create user
    if(!user){
      var user = new User({
        default_meeting_len: 30,
        slack_ID: message.user,
        slack_Username: slackUser.profile.real_name,
        slack_Email: slackUser.profile.email,
        slack_DM_ID: message.channel
      })
      return user.save();
    }

    // return existing user
    else{
      return user;
    }
  })
  .then(function(user){

    // if not registered with google yet

    if(!user.googleAccount.access_token){
        web.chat.postMessage(message.channel,
          'Use this link to give access to your google cal account ' + process.env.DOMAIN + '/connect?auth_id='
          + user._id);
          return;
    }

    else {

         var promise = Promise.resolve(user);

         if(message.text.indexOf('schedule')!==-1){
           message.text = setInvitees(message.text , user.pendingState);
           promise = user.save();
         }

         promise
         .then(function(user){

           var temp = encodeURIComponent(message.text);

           return axios.get(`https://api.api.ai/api/query?v=20150910&query=${temp}&lang=en&sessionId=${message.user}`, {
             "headers": {
               "Authorization":"Bearer 678861ee7c0d455287f791fd46d1b344"
             },
           })

         })
         .then(function({ data }){

           if(message.text.indexOf("schedule")!==-1){
             meetingFunction(data, message, user); //cccccc
           }
           else{
             taskFunction(data, message, user);
           }

         })
         .catch(function(error){
           console.log(error);
         })
    }

  })
  .catch(function(err){
    console.log(err);
  })

});

module.exports = {
  rtm,
  web,
  taskPath
}
