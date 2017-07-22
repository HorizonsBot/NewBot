var moment = require('moment');
moment().format();

var getWeekArray = function(date, time){

  console.log("entered getWeekArray");
  var startString = date + time;
  var a = moment(date);
  var b = a.add(7, 'day'); //make this shit a moment god dammit
  var c = b.format().substring(0,19);
  var endString = c.split('T').join(' ');
  var start = moment(startString, 'YYYY-MM-DD hh:mm a');
  var end = moment(endString, 'YYYY-MM-DD hh:mm a');
  var result = [];
  var current = moment(start);
  while (current <= end) {
        result.push(current.format('YYYY-MM-DD HH:mm'));
        current.add(30, 'minutes');
  }

  console.log("original weekArray", result);

  result = result.filter(function(item){
    var item = item.split(' ');
    var time = parseInt(item[1].substring(0,2));
    return (time>=9 && time<=18);
  })

  return result;

}  //returns week array

var limitWeekArray = function(weekArray){

  console.log("entered limitWeekArray");

  var finalArray = [];

  for(var i = 1; i < 8 ; i++){
    finalArray.push([]);
  }

  console.log("finalArray", finalArray);

  var j = 0 ;

  for(var i=0;i<weekArray.length; i++){
    if(finalArray[j].length===3){
      j++;
      var date = parseInt(weekArray[i].substring(8,10));
      var target = date===30 || date===31 ? 1 : date+1;
      for(var z=0;z<weekArray.length;z++){
        var look = parseInt(weekArray[z].substring(8,10));
        if(target === look){
          i=z;
          break;
        }
      }
      if(j===7)break;
    }
    finalArray[j].push(weekArray[i]);
  }

  console.log("finalArray", finalArray);
  var mainArray = [];
  var k=0;
  while(mainArray.length!==10){
    if(finalArray[k].length===0)k++;
    mainArray.push(finalArray[k].shift());
  }
  console.log("mainArray", mainArray);
  return mainArray;
} // cuts down weekArray to 10 slots;

var cutWeekArray = function(busyArray, state){

  console.log("entered function cutWeekArray");

  var weekArray = getWeekArray(state.date, state.time);

  console.log("weekArray", weekArray);

  for(var i=0;i<busyArray.length;i+=2){
    var x = weekArray.indexOf(busyArray[i]);
    var y = weekArray.indexOf(busyArray[i+1]);
    if(x!==-1)weekArray.splice(x,y-x);
  }
  console.log("after cutting weekArray", weekArray);
  return limitWeekArray(weekArray);
} // returns week array with available time slots

var getSlots = function(busyArray, user){
  var result = cutWeekArray(busyArray, user.pendingState);
  console.log("after cutting and limiting", result);
  return result;
}

module.exports = {
  getSlots
}
