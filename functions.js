var { RtmClient, RTM_EVENTS, WebClient } = require('@slack/client');
var token = process.env.SLACK_SECRET || '';
var rtm = new RtmClient(token);
var {User, Reminder, Meeting} = require('./models');
var axios = require('axios');
var moment = require('moment');
var _ = require('underscore');
moment().format();
var google = require('googleapis');
var OAuth2 = google.auth.OAuth2;
function getGoogleAuth() {
  return new OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.DOMAIN + '/connect/callback'
  );
}

// var googleSetCreds = bluebird.promisify()

var checkAccessToken = ( user ) => {
  var curTime = Date.now();
  if ( curTime > user.googleAccount.expiry_date ) {
    console.log("EXPIRED ACCESS TOKEN");
    var googleAuth = getGoogleAuth();
    googleAuth.setCredentials(user.googleAccount);
    return googleAuth.refreshAccessToken(function(err, tokens) {
       rtm.sendMessage('Refreshing user access_token', user.slack_DM_ID);
       console.log("REFRESH ACTOKEN PROCESS, TOKENS:", tokens);
       user.googleAccount = Object.assign({}, user.googleAccount, tokens);
       return user.save(function() {
         return user;
       })
    })
  } else {
    console.log('token still good homie');
    return user;
  }
}

var clearState = (user) => {
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

var taskPath = (user) => {

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

var findAttendees = (state) => {

  return User.find({})
  .then(function(users){
    var attendees = [];
    users.forEach(function(item){
      var id = item.slack_ID;
      console.log(item);
      if(state.inviteesBySlackid.indexOf(id) !== -1){
          attendees.push({"email": item.googleAccount.email});
      }
    })
    return attendees;
  })

}

var calculateEndTimeString = (state) => {
    //set up for default 30 minute meetings until api.ai is trained better
    var meetingLength = 60;
    var end =  state.date + 'T' + state.time;
    var endMoment = moment(end);
    endMoment.add(meetingLength, 'minute');
    return endMoment;
}

var calculateStartTimeString = (state) => {
    var start =  state.date + 'T' + state.time;
    var startMoment = moment(start);
    return startMoment;
}

var meetingPath = (user) => {

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
  meetingPath,
  getGoogleAuth,
  checkAccessToken
}
