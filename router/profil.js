const express = require('express');
const axios = require('axios');
const router = express.Router();
const db = require("../modul/sqlite.js");


router.get("/", async (req,res)=>{
    
    if (req.session.user) {
        const {id} = req.session.user
       let userData = await db.list(`select * from user where ID = "${id}"`) 
        res.send(userData);
    } else {
        res.json({status:0});
    }

})

router.get("/input", async (req,res)=>{
    
    if (req.session.user) {
        const {id} = req.session.user
       let userData = await db.list(`select * from io  `) 
        res.send(userData);
    } else {
        res.json({status:0,message:"İnput sayfası Yetkiniz yok"});
    }

})


router.post("/input", async (req,res)=>{
        const form = req.body;
    if (req.session.user) {
        const {id} = req.session.user
       let userData = await db.guncelleID("io",form.ID,form) 
        res.send(userData);
    } else {
        res.json({status:0,message:"İnput sayfası Yetkiniz yok"});
    }

})

router.get("/menu", async (req,res)=>{

    if (req.session.user) {
 
       let userData = await db.list(`select * from menu `) 
        res.send(userData);
    } else {
        res.json({status:0});
    }



})


//hava durumu 
router.post("/hd", async (req,res)=>{

    if (req.session.user) {
        const {id} = req.session.user
       let userData = await db.list(`select * from user WHERE  ID="${id}" `) 

       let config = {
        method: 'get',
        maxBodyLength: Infinity,
        url: `https://servis.mgm.gov.tr/web/merkezler?il=${userData[0].il}&ilce=${userData[0].ilce}`,
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
      
     await axios.request(config)
      .then( async (response) => {
        let ilid = response.data.merkezId;

        let configs = {
            method: 'get',
            maxBodyLength: Infinity,
            url: 'https://servis.mgm.gov.tr/web/sondurumlar?merkezid=91608',
            headers: { 
              'Accept': 'application/json, text/plain, */*', 
              'Accept-Language': 'tr,en;q=0.9,tr-TR;q=0.8,en-US;q=0.7,de;q=0.6,am;q=0.5,ar;q=0.4', 
              'Connection': 'keep-alive', 
              'DNT': '1', 
              'If-None-Match': 'W/"1cd-bqf+7Mtwdy1XMxAlKvH7yqfTJ00"', 
              'Origin': 'https://www.mgm.gov.tr', 
              'Referer': 'https://www.mgm.gov.tr/', 
              'Sec-Fetch-Dest': 'empty', 
              'Sec-Fetch-Mode': 'cors', 
              'Sec-Fetch-Site': 'same-site', 
              'Host': 'servis.mgm.gov.tr'
            }
          };


          let sicaklik = await  axios.request(configs)
       

        res.json(sicaklik.data);
      })
      .catch((error) => {
        res.send(error);
      });


      
    } else {
        res.json({status:0});
    }



})



module.exports = router;