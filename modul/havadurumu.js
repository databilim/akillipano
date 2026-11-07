const axios = require('axios');
const db = require("../modul/sqlite.js");

module.exports = async ( )=>{

 

   return new Promise((resolve,reject)=>{
    let config = {
        method: 'get',
        maxBodyLength: Infinity,
        url: `https://servis.mgm.gov.tr/web/merkezler?il=${il}&ilce=${ilce}`,
        headers: { 
          'Accept': 'application/json, text/plain, */*', 
          'Accept-Language': 'tr,en;q=0.9,tr-TR;q=0.8,en-US;q=0.7,de;q=0.6,am;q=0.5,ar;q=0.4', 
          'Connection': 'keep-alive', 
          'DNT': '1', 
          'If-None-Match': 'W/"1cd-bqf+7Mtwdy1XMxAlKvH7yqfTJ00"', 
          'Origin': 'https://www.mgm.gov.tr', 
          'Referer': 'https://www.mgm.gov.tr/'
        }
      };
      
      axios.request(config)
      .then((response) => {
        resolve(response.data);
      })
      .catch((error) => {
        reject(error);
      });

   })  
    
      
}

