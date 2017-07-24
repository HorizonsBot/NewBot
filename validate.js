var {RtmClient, RTM_EVENTS, WebClient} = require('@slack/client');
var token = process.env.SLACK_SECRET || '';
var web = new WebClient(token);
var rtm = new RtmClient(token);

var {User, Reminder, Meeting} = require('./models');
var {getSlots} = require('./getSlots');
var {getConObject} = require('./getConObject');
var {calculateStartTimeString} = require('./functions')
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

var timeCheck = function(user, message){
  console.log("entered time check");
  console.log("MESSAGE", message);
  var dateNow = new Date();
  var dateArr = user.pendingState.date.split('-');
  var timeArr = user.pendingState.time.split('-');
  var dateMeet = new Date(Date.UTC(dateArr[0], dateArr[1]-1, dateArr[2], timeArr[0]+7, timeArr[1], timeArr[2]));
  //note changes for month, and GMT-700 timezone
  var hoursDiff = Math.abs(dateNow - dateMeet) / 36e5;

  // var date = new Date();
  // var hourNow = date.getHours();
  // var meetingHour = parseInt(user.pendingState.time.substring(0,2));
  if(hoursDiff < 4 ){
      obj.attachments[0].text = `Too soon to schedule a meeting bro`;
      obj.attachments.actions = [{
        "name": "cancel",
        "text": "Cancel",
        "type": "button",
        "value": "cancel"
      }]
      web.chat.postMessage(message.channel, "Scheduler Bot", obj, function(err, res) {
          if (err) console.log('Error:', err);
          else console.log('Message sent: ', res);
     });
     return false;
  }
  else return true;
}

var findAttendeesHere = function(user){
  // var state = user.pendingState;
  // console.log("finding attendees here");
  // var attendees = [];
  // attendees.push({slack_ID:user.slack_ID, email:user.googleAccount.email, access_token:user.googleAccount.access_token});
  // return User.find({})
  // .then(function(users){
  //   users.forEach(function(item){
  //     if(state.inviteesBySlackid.indexOf(item.slack_ID) !== -1){
  //       if(!item.googleAccount){
  //           attendees.push({"slack_ID": id, "email":"", "access_token":""});
  //       }else{
  //           attendees.push({"slack_ID": id, "email": item.googleAccount.email, "access_token": item.googleAccount.access_token});
  //       }
  //     }
  //   })
  //   return attendees;
  // })
  // .catch(error => {
  //   console.log(error);
  // })

  var attendeesPromises = [];
  var attendees = [];
  var array = user.pendingState.inviteesBySlackid;
  array.forEach(function(item){
    attendeesPromises.push(User.findOne({slack_ID:item}));
  })

  return Promise.all(attendeesPromises)
  .then(function(people){
    people.forEach(function(item, index){
      if(!item){
        attendees.push({
          "slack_ID": array[index],
          "email":"",
          "access_token":""
        });
        rtm.sendMessage("say hi",rtm.getDmById(array[index])) // ask jay
      } else if (!item.googleAccount) {
        attendees.push({
          "slack_ID": item.id,
          "email":"",
          "access_token":""
        });
      } else {
        attendees.push({
          "slack_ID": item.slack_ID,
          "email": item.googleAccount.email,
          "access_token": item.googleAccount.access_token
        });
      }
    })
    console.log("ATTENDEES ARRAY in findAttendeesHere", attendees);
    return new Promise(function(resolve, reject) {
      resolve(attendees);
    })
    // return attendees;
  })
  .catch(function(err) {
    console.log("Error in findAttendeesHere", err);
  })
}

var pendingFunction = function(user, attendees){
  var requester = user;
  console.log("entered pending function saving meeting in database");
  var state = user.pendingState;
  var meeting = new Meeting({
    eventId: meetings,
    date: state.date,
    time: state.time,
    invitees: attendees, //this attendess is array of objects with empty email but has slack id
    requesterId: user.slack_ID,
    createdAt: new Date()
  })
  meeting.save();
  attendees.forEach(function(attendee){
    console.log("sending direct message to everyone");
    if(attendee.email===''){
      User.findOne({slack_ID:attendee.slack_ID},function(err,user){
        rtm.sendMessage(`User ${requester.slack_Username} is trying to schedule a meeting with you and the scheduler bot needs access to your Google calendar. Use this link to grant access: ` + process.env.DOMAIN + '/connect?auth_id='
        + user._id, user.slack_DM_ID);
      });
    }
  })
}

// var bluebird = require('bluebird')

var checkConflict = function(user){
  console.log("entered check conflict");
  var attendees = findAttendeesHere(user)
  return attendees
  .then((attendees) => {
    console.log("ATTENDEES  received,", attendees, " proceeding to check calendars");
    var calendarPromises = [];
    var attendeeCalendars;
    var busyArray = [];

    attendees.forEach(function(attendee){
      if(attendee.email===""){
        console.log("sending to pending function cause attendee email is blank");
        pendingFunction(user, attendees);
        return "People are unavailable";
      }
      var email = encodeURIComponent(attendee.email);
      var calendarStart = new Date().toISOString();
      var timeMin = encodeURIComponent(calendarStart);
      var accessToken = encodeURIComponent(attendee.access_token);
      calendarPromises.push(axios.get(`https://www.googleapis.com/calendar/v3/calendars/${email}/events?timeMin=${timeMin}&access_token=${accessToken}`))
    })

    return Promise.all(calendarPromises)
        .then(function(calendars) {

            attendeeCalendars = calendars.map(function(calendar) {
                return calendar.data.items;
            })

            attendeeCalendars.forEach(function(calendar, index){
              attendeeCalendars[index] = calendar.filter(function(item){
                return item.start.dateTime;
              })
            })

            attendeeCalendars.forEach(function(calendar, index){
             attendeeCalendars[index] = calendar.forEach(function(item){
                var start = item.start.dateTime.split('T');
                var end = item.end.dateTime.split('T');
                var startArr = [start[0], start[1].slice(0,5)];
                var endArr = [end[0], end[1].slice(0,5)];
                busyArray.push(startArr.join(' '));
                busyArray.push(endArr.join(' '));
              })
            })

            console.log("busyArray", busyArray);

            var meetingString = user.pendingState.date + ' ' + user.pendingState.time.substring(0,5);

            console.log("meetingString", meetingString);

            if( busyArray.indexOf(meetingString) === -1 ){
              console.log("there is no conflict");
              return "NoConflict"; //  no conflict;
            }
            return Promise.resolve(getSlots(busyArray, user));
            // return getSlots(busyArray, user);
        })
        .catch(function(err){
          console.log(err)
        });

  })
}

// var setString = function(myString){
//   var myArray = myString.split(' ');
//   myArray.forEach(function(item,index){
//     if(item[0]==='<'){
//       item = item.substring(2,item.length-1);
//       myArray[index] = rtm.dataStore.getUserById(item).real_name;
//     }
//   });
//   return myArray.join(' ');
// }


var validate = function(user, message){
  console.log("entered validation");
  if(!timeCheck(user, message)){
    console.log("time check returned false");
    return;
  }
  else{
    console.log("time check returned true proceeding to conflict check");
    // var response = checkConflict(user);
    var response;
    response = Promise.resolve(checkConflict(user));

    console.log("IS RESPONSE A PROMISE", response);
    // response = Promise.resolve(response)
    response
    .then((response) => {
      if (response === "People are unavailable") {
        rtm.sendMessage("People are unavailable, the request has been sent to them, meeting will be scheduled once they accept it.", user.slack_DM_ID);
      } else if (response === 'NoConflict') {
        console.log("there was no conflict");
        var regex = /<@\w+>/g;
        message.text = message.text.replace(regex, function(match) {
          var userId = match.slice(2, -1);
          var invitee = rtm.dataStore.getUserById(userId);
          console.log("Inside Validate, SLACK USERS", userId, invitee);
          return invitee.profile.first_name || invitee.profile.real_name;
        })
        // var inviteString = setString(message.text);
        obj.attachments[0].text = `Schedule meeting with ${message.text} on ${user.pendingState.date} ${user.pendingState.time} about ${user.pendingState.subject}`;
        web.chat.postMessage(message.channel, "Scheduler Bot", obj,function(err, res) {
          if (err) console.log('Error:', err);
          else console.log('Message sent: ', res);
        });
      } else {
        console.log("entered conflict");
        console.log("RESPONSE", response);
        var targetObj = getConObject(response);
        web.chat.postMessage(message.channel, "Scheduler Bot", targetObj,function(err, res) {
          if (err) console.log('Error:', err);
          else console.log('Message sent: ', res);
        });
      }
    })
  }
}

module.exports = {
  validate
}
