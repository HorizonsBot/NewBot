var dropdown_obj = {
  "attachments": [
       {
           "text": "Scheduled time was not available. Here are some alternatives!",
           "fallback": "WHAT IS A FALLBACK BRO?",
           "color": "#3AA3E3",
           "attachment_type": "default",
           "callback_id": "alt_date_selection",
           "actions": [
               {
                   "name": "alt_dates",
                   "text": "Pick an alternate date and time...",
                   "type": "select",
                   "options": []
               },
               {
                 "name": "confirm",
                 "text": "Cancel",
                 "type": "button",
                 "value": "cancel"
               }
           ]
       }
   ]
}

var getConObject = function(array){
  var tempObj = dropdown_obj;
  for(var i = 0 ;i < array.length; i++ ){
    tempObj.attachments[0].actions[0].options.push({"text":array[i], "value":array[i]})
  }
  console.log('TEMPOBJ HERE ==>>> ', tempObj);
  return tempObj;
}

module.exports = {
  getConObject;
}
