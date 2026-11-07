const i2c = require('./i2c');
const km = {
        
        priz:(obj)=>{

                i2c.i2cDataGonder(obj.i2cAdres,`${9+obj.kapi}${obj.durum}`)    
           
        },
        anahtar:(obj)=>{
                i2c.i2cDataGonder(obj.i2cAdres,`${9+obj.kapi}${obj.durum}`)   
        },
        zil:()=>{

                
        }
}



module.exports = km;