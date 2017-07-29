var  {User, Reminder, Meeting} = require('./models');
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

var checkAccessToken = ( user ) => {

  var curTime = Date.now();
  if ( curTime > user.googleAccount.expiry_date ) {
    console.log("EXPIRED ACCESS TOKEN");

    var googleAuth = getGoogleAuth();
    googleAuth.setCredentials(user.googleAccount);

    return googleAuth.refreshAccessToken(function(err, tokens) {
      console.log("REFRESH ACTOKEN PROCESS, TOKENS:", tokens);
      user.googleAccount = Object.assign({}, user.googleAccount, tokens);
      console.log("CHECK GOOGLEACCOUNT in checkAccessToken (functions.js)", user.googleAccount);

      return user.save(function(err,user){
       return user;
      })

    })

  }
  else {
    console.log('token still good of the guy using the bot.');
    return user;
  }
}

var checkThis = (attendee) => {
  console.log("entered check this");

  return User.findOne({slack_ID:attendee.slack_ID})
  .then(function(user){
    console.log(user.slack_Username);
    var curTime = Date.now();
    if ( curTime > user.googleAccount.expiry_date ) {
      console.log("EXPIRED ACCESS TOKEN");
      var googleAuth = getGoogleAuth();
      googleAuth.setCredentials(user.googleAccount);
      googleAuth.refreshAccessToken(function(err, tokens) {
         console.log("REFRESH ACTOKEN PROCESS, TOKENS:", tokens);
         user.googleAccount = Object.assign({}, user.googleAccount, tokens);
         console.log("CHECK GOOGLEACCOUNT in checkAccessToken (functions.js)", user.googleAccount);
         user.save(function(user) {
           return user;
         })
      })
    }
    else {
      console.log('token still good');
      return user;
    }
  })
  .then(function(user){
    console.log("setting access token of attendee from user");
    attendee.access_token = user.googleAccount.access_token;
    console.log("from checkThis passing this attendee");
    return attendee;
  })
  .catch(function(error){
    console.log("error", error);
  })
}

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
    console.log("entered taskPath");
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
      if(state.inviteesBySlackid.indexOf(id) !== -1){
          attendees.push({"email": item.googleAccount.email});
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
    .then(function(attendees){

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

        if(response.status === 200){
          console.log("this is the response status", response.status);
          return true;
        }
        else return false;

      })
      .catch(function(err){
        console.log(err);
      })
    })
    .catch( function(error) {
      console.log(error);
    })
  }
}


module.exports = {
  clearState,
  taskPath,
  meetingPath,
  checkAccessToken,
  checkThis
}
