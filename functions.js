var  {User, Reminder, Meeting} = require('./models');
var axios = require('axios');
var moment = require('moment');
var _ = require('underscore');
moment().format();

var clearState = function(user){
  user.pendingState = {
    subject: "",
    date: "",
    time: "",
    invitees: [],
    inviteesBySlackid: [],
  };
  user.active = 0 ;
  user.save(function(err){
    if(err)console.log(err);
  });
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

function findAttendees(state){

  return User.find({})
  .then(function(users){
    var attendees = [];
    users.forEach(function(item){
      var id = item.slack_ID;
      console.log(item);
      if(state.inviteesBySlackid.indexOf(id) !== -1){
          attendees.push({"email": item.googleAccount.email);
      }
    })
    return attendees;
  })

}

function calculateEndTimeString(state){
    //set up for default 30 minute meetings until api.ai is trained better
    var meetingLength = 60;
    var end =  state.date + 'T' + state.time;
    var endMoment = moment(end);
    endMoment.add(meetingLength, 'minute');
    return endMoment;
}

function calculateStartTimeString(state){
    var start =  state.date + 'T' + state.time;
    var startMoment = moment(start);
    return startMoment;
}

var meetingPath = function(user){

    var state = user.pendingState;
    var start = calculateStartTimeString(state);
    var end = calculateEndTimeString(state);
    var subject = state.subject || 'DEFAULT MEETING SUBJECT';

    if(user){

    return findAttendees(state)
    .then((attendees) => {

      var new_event = {
        "end": {
          "dateTime": end,
          "timeZone": "America/Los_Angeles"
        },
        "start": {
          "dateTime": start,
          "timeZone": "America/Los_Angeles"
        },
        "summary": subject,
        "attendees": attendees
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

        if(response.status === 200)return true;
        else return false;

      })
      .catch(function(err){
        console.log(err);
      })
    })
    .catch( error => {
      console.log(error);
    })
  }

}


module.exports = {
  clearState,
  taskPath,
  meetingPath
}
