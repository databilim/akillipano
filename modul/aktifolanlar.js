const db = require("../modul/sqlite.js");
const lib = require('../modul/i2c');
module.exports = async (io)=>{

 let aktifler = await db.list("SELECT * FROM io WHERE durum=1 ")

    aktifler.forEach(aktif => {
            let outupts = JSON.parse(aktif.output);
            if(aktif.status == 1){
                outupts.forEach((ac)=>{

                    lib.i2cDataGonder(100,`${9+ac}${1}`)  
                })

                //   
            }
    });
 
  

 






}