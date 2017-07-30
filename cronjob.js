var mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI);

var { User, Reminder } = require('./models');
var { rtm } = require('./app');

Reminder.find({}, function(err, reminders) {
  console.log("REMINDERS", reminders);
  if(err) {
    console.log('There was an error with finding the reminders');
  } else {
    // reminders is an array of reminder JSONs
    // const curDate = new Date().toLocaleDateString();
    const curDate = new Date().toISOString().split('T')[0];
    // sets up the next day
    const tomDate = new Date(new Date().getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    // const tomDay = parseInt(curDate.split('/')[1]) + 1;
    // let tomDate = curDate.split('/')
    // tomDate[1] = parseInt(tomDate[1]) + 1;
    // tomDate = tomDate.join('/')
    console.log("TODAY DATE", curDate, "TOMORROW DATE", tomDate);

    User.find({}, function(err, users) {
      console.log("YO! I FOUND USERS!", users);
    });

    reminders.forEach(function(reminder) {
      if( curDate === reminder.day ) {    //On due day of reminder, send Slack msg & delete the reminder doc
        console.log("Reminder now", reminder);
        console.log('need to send RTM message here');
        User.findOne({slack_ID: reminder.reqID}, function(err, user) {
          console.log("TODAY, USER iS", user);
          rtm.sendMessage(`Reminder! You gotta remember to ${reminder.subject} today bro!`, user.slack_DM_ID)
          web.chat.postMessage(user.slack_DM_ID, `Reminder! You gotta remember to ${reminder.subject} today bro!`, function(){
            process.exit(0);
          })
          if(!err) {
            Reminder.remove({reqID: reminder.reqID}, function(err) {
              if(err) {
                console.log("Error removing reminder for today!");
              }
            })
          }
        })
      } else if ( tomDate === reminder.day ) {    //On day before due day of reminder, send Slack msg to app user
        User.findOne({slack_ID: reminder.reqID}, function(err, user) {
          rtm.sendMessage(`Reminder! You gotta remember to ${reminder.subject} tomorrow bro!`, user.slack_DM_ID)
          web.chat.postMessage(user.slack_DM_ID, `Reminder! You gotta remember to ${reminder.subject} tomorrow bro!`, function(){
            process.exit(0);
          })
        })
      }
    })
  }
})
