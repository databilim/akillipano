

const i2c = require('i2c-bus');
const i2cBusNumber = 1;
const i2c1 = i2c.openSync(1); 
  

  module.exports = {
    
    i2cScan: ()=>{
        i2c.openPromisified(i2cBusNumber)
            .then((i2c1) => {
   
                // I2C adreslerini listeleme
                return i2c1.scan()
                .then((addresses) => {
                    console.log('Found devices at addresses:', addresses);
                })
                .finally(() => i2c1.close());
            })
            .catch((err) => {
                console.error('Error:', err);
            });
    },
 
    i2cDataGonder:  (address, data)=>{

        try {
          const buffer = Buffer.alloc(8);
          buffer.writeUInt8(data);
          i2c1.writeI2cBlockSync(address, 0, buffer.length, buffer);
          i2c1.closeSync();
        } catch (error) {
            return " Adres hatası ";
        }
      },
      i2cDataOku : (address) =>{
        // I2C üzerinden veri okuma
        try {
          const buffer = Buffer.alloc(2);
          i2c1.i2cReadSync(address, buffer.length, buffer);
          
              return  buffer .toString("hex") ;
        } catch (error) {
    
          return ` ${address} Numaralı  Böyle bir adres yok `;
    
        }
            
    },
      searchButtonType : (type) =>{
        let buttonArray = [
            {
              type:"01ff",
              input:"1"
            },
            {
              type:"02ff",
              input:"2"
            },
            {
              type:"03ff",
              input:"3"
            },
            {
              type:"04ff",
              input:"4"
            },
            {
              type:"05ff",
              input:"5"
            },
            {
              type:"06ff",
              input:"6"
            },
            {
              type:"07ff",
              input:"7"
            },
            {
              type:"08ff",
              input:"8"
            },
            {
              type:"09ff",
              input:"9"
            },
            {
              type:"0aff",
              input:"10"
            },
            {
              type:"0bff",
              input:"11"
            },
            {
              type:"0cff",
              input:"12"
            },
            {
              type:"0dff",
              input:"13"
            },
            {
              type:"0eff",
              input:"14"
            },
            {
              type:"0fff",
              input:"15"
            },
            {
              type:"10ff",
              input:"16"
            },
            {
              type:"0dff",
              input:"13"
            }
            ,
            {
              type:"ccc",
              input:"000"
            }
            
          ];
        const foundButton = buttonArray.find(item => item.type === type);
    
        return foundButton;
     
    
    },
  


  
  }