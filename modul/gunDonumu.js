const SunCalc = require('suncalc');
const moment = require('moment');

const latitude = 40.2185516;
const longitude = 28.1651219;

function getSunTimesForToday(latitude, longitude) {
    const today = new Date();
    const times = SunCalc.getTimes(today, latitude, longitude);
    return {
        date: moment(today).format('YYYY-MM-DD'),
        sunrise: moment(times.sunrise).format('HH:mm:ss'),
        sunset: moment(times.sunset).format('HH:mm:ss')
    };
}

const sunTimes = getSunTimesForToday(latitude, longitude);
console.log(sunTimes);
 