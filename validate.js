var {RtmClient, RTM_EVENTS, WebClient} = require('@slack/client');
var token = process.env.SLACK_SECRET || '';
var web = new WebClient(token);
var rtm = new RtmClient(token);
rtm.start();
var {User, Reminder, Meeting} = require('./models');
var {getSlots} = require('./getSlots');
var {getConObject} = require('./getConObject');
var axios = require('axios');
var moment = require('moment');
var _ = require('underscore');
moment().format();
var {checkThis, calculateStartTimeString, clearState} = require('./functions');

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

  var attendeesPromises = [];

  var attendees = [];
  attendees.push({slack_ID:user.slack_ID, email:user.googleAccount.email, access_token:user.googleAccount.access_token});
  var array = user.pendingState.inviteesBySlackid;

  array.forEach(function(item){
    attendeesPromises.push(User.findOne({slack_ID:item}));
  })

  return Promise.all(attendeesPromises)
  .then(function(people){
    people.forEach(function(item, index){
      console.log("logging people one by one", item);
      if(!item){
        console.log("this guy is not in the database.");
        attendees.push({"slack_ID": array[index], "email":"", "access_token":""});
        //var link = process.env.DOMAIN + '/connect?auth_id=' + attendee._id;
        web.im.open(array[index], function(err, info) {
          rtm.sendMessage(`User ${user.slack_Username} is trying to schedule a meeting with you. Say hi.`,
            info.channel.id);
        })
      }else if(!item.googleAccount.email){
        console.log("i want to enter here");
        attendees.push({"slack_ID": item.slack_ID, "email":"", "access_token":""});
      }else {
        attendees.push({"slack_ID": item.slack_ID, "email": item.googleAccount.email, "access_token": item.googleAccount.access_token});
      }
    })
    console.log("attendees", attendees);

    return attendees;
  })

}

var pendingFunction = function(user, attendees){
  var requester = user;
  console.log("entered pending function saving meeting in database");
  var state = user.pendingState;
  var meeting = new Meeting({
    date: state.date,
    time: state.time,
    invitees: attendees, //this attendess is array of objects with empty email but has slack id
    requesterId: user.slack_ID,
    createdAt: new Date()
  })
  meeting.save();

  var noEmailPromise =[];

  attendees.forEach(function(attendee){
    console.log("check 1", attendee);
    if(attendee.email === ''){
      noEmailPromise.push(User.findOne({slack_ID:attendee.slack_ID}));
    }
  })
  console.log("noEmailPromise", noEmailPromise);
  Promise.all(noEmailPromise)
  .then(function(noEmailArray){
    console.log("noEmailArray", noEmailArray);
    noEmailArray.forEach(function(attendee){
      console.log("logging attendees without emails here", attendee);
      var link = process.env.DOMAIN + '/connect?auth_id=' + attendee._id;
      web.im.open(attendee.slack_ID, function(err, info) {
        rtm.sendMessage(`User ${requester.slack_Username} is trying to schedule a meeting with you and the scheduler bot needs access to your Google calendar. Use this link to grant access: ${link}`,
          info.channel.id);
        attendee.slack_DM_ID = info.channel.id;
        attendee.save(function(e, u) {
          console.log('U', u);
        })
      })

    })
  });
}

var checkConflict = function(user){
  console.log("entered check conflict");

  var checkThisPromises = [];
  var calendarPromises = [];
  var attendeeCalendars;
  var busyArray = [];

  return findAttendeesHere(user)
  .then(attendees => {

    console.log("attendees recieved proceeding to check calendars");

    for(var i=0; i<attendees.length; i++){
      if(attendees[i].email === ""){
        console.log("sending to pending function cause attendee email is blank");
        pendingFunction(user, attendees);
        return "People are unavailable";
      }else {
        checkThisPromises.push(checkThis(attendees[i]));
      }
    }

    return Promise.all(checkThisPromises);
  })
  .then(function(results) {
    if(results === "People are unavailable"){
      console.log("entered first return", results);
      return results;
    }
    results.forEach(function(attendee){
      var email = encodeURIComponent(attendee.email);
      var calendarStart = new Date().toISOString();
      var date = new Date();
      date.setDate(date.getDate() + 7);
      console.log("*******", date);
      var timeMin = encodeURIComponent(calendarStart);
      console.log("timeMin", timeMin);
      var calendarEnd = date.toISOString();
      var timeMax = encodeURIComponent(calendarEnd);
      console.log("timeMax", timeMax);
      var accessToken = encodeURIComponent(attendee.access_token);
      calendarPromises.push(axios.get(`https://www.googleapis.com/calendar/v3/calendars/${email}/events?timeMin=${timeMin}&timeMax=${timeMax}&access_token=${accessToken}`));
    });
    return Promise.all(calendarPromises);
  })
  .then(function(calendars) {

    if(calendars === "People are unavailable"){
      console.log("entered second return", calendars);
      return calendars;
    }
      console.log("entered calendar mapping");

      attendeeCalendars = calendars.map(function(calendar) {
          return calendar.data.items;
      })

      attendeeCalendars.forEach(function(calendar, index){
        console.log("calendar", calendar);
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

      return getSlots(busyArray, user);
  })
  .catch(function(err){
    console.log(err)
  });
}

var setString = function(myString, user){
  var myArray = myString.split(' ');
  var i =0 ;
  myArray.forEach(function(item,index){
    if(item[0]==='<'){
      console.log("item", item);
      item = item.substring(2,item.length-1);
      console.log("changed item", item);
      myArray[index] = user.pendingState.invitees[0];
      i++;
    }
  });
  return myArray.join(' ');
}


var validate = function(user, message){
  console.log("entered validation");
  if(!timeCheck(user, message)){
    console.log("time check returned false");
    return;
  }
  else{
    console.log("time check returned true proceeding to conflict check");
    checkConflict(user)
    .then( response => {
      if (response === "People are unavailable"){
        rtm.sendMessage("People are unavailable, the request has been sent to them, meeting will be scheduled once they accept it.", user.slack_DM_ID);
        clearState(user);
      } else if (response === 'NoConflict'){
        console.log("there was no conflict");
        var inviteString = setString(message.text, user);
        console.log('andrew look here ', user);
        if(user.pendingState.subject){
          obj.attachments[0].text = `Confirm a meeting with ${user.pendingState.invitees.join(', ')} on ${user.pendingState.date} at ${user.pendingState.time} about ${user.pendingState.subject}`
        }else{
          obj.attachments[0].text = `Confirm a meeting with ${user.pendingState.invitees.join(', ')} on ${user.pendingState.date} at ${user.pendingState.time}`
        }
        web.chat.postMessage(message.channel, "Scheduler Bot", obj,function(err, res) {
          if (err) console.log('Error:', err);
          else console.log('Message sent: ', res);
        });
      } else {
        console.log("entered conflict");
        var targetObj = getConObject(response);
        console.log("displaying object now", targetObj.attachments[0].actions[0].options);
        web.chat.postMessage(message.channel, "Scheduler Bot", targetObj, function(err, res) {
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
