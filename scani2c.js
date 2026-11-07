const lib = require('./modul/i2c');
lib.i2cScan();

lib.i2cDataGonder(100,`${9+12}${0}`)