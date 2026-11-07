const express = require('express');
const router = express.Router();
const db = require("../modul/sqlite.js");
router.post("/", async (req,res)=>{
    const {user,parola}= req.body;
   // console.log(req.params)

  let usercek = await db.list(`select * from user where user="${user}" AND password ="${parola}"`);

    
    if(user == ""){
        res.json({status:0, message:"Kullanıcı Boş bıraktınız"})
    }else if (parola=="") {

        res.json({status:0, message:"Parola Boş bıraktınız"})
    }else{
        if(usercek.length > 0){

            req.session.user = {
                id: usercek[0].ID,
                username: usercek[0].password
            };

            res.json({status:1,usercek})
        }else{
            res.json({status:0,message:"Böyle bir uyelik oluşturulmadı"})
        }

    }

   
    
})


module.exports = router;