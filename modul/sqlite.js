 
const sqlite3 = require('sqlite3').verbose();
let db = new sqlite3.Database('pano.db');
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS user (  
        ID  INTEGER PRIMARY KEY AUTOINCREMENT , 
        panoName TEXT , 
        user TEXT, 
        password TEXT,  
        adres TEXT,  
        durum  INTEGER)`);

    db.run(`CREATE TABLE IF NOT EXISTS io (  
            ID  INTEGER PRIMARY KEY AUTOINCREMENT , 
            userID INTEGER , 
            type TEXT, 
            protokol TEXT,  
            adres INTEGER,  
            durum  INTEGER)`);      
   

     
});

class veritabani {
    constructor(dosyaAdi){
        this.db = new sqlite3.Database(dosyaAdi);
        this.db.serialize(() => {
            this.db.run(`CREATE TABLE IF NOT EXISTS user (  
                ID  INTEGER PRIMARY KEY AUTOINCREMENT , 
                panoName TEXT , 
                user TEXT, 
                password TEXT,  
                adres TEXT,  
                durum  INTEGER)`);
            this. db.run(`CREATE TABLE IF NOT EXISTS input (  
                ID    INTEGER PRIMARY KEY AUTOINCREMENT,
                hex   TEXT,
                adres INTEGER,
                durum INTEGER)`);            
        });
    }

    ekle(table,obj){
        let keys= Object.keys(obj).join();
        let value = Object.values(obj) 
        let arr = [];
        for(let x = 0; x < value.length; x++){
    
            arr.push("?");
        }
      
      return new Promise((resolve, reject)=>{
        this.db.run(`INSERT INTO ${table} (${keys}) VALUES (${arr.join()})`,value,(err)=>{
            if(err){
                reject(0)
            }else{
                resolve(1)
            }
        })
      })  

    }

    list(sor){
        return new Promise((resolve, reject)=>{
        this.db.all(sor,(err, rows)=>{
            if(err){
                reject(0)
            }else{
                resolve(rows)
            }
        });

        })
    }


    silID(tableName,ID) {
        return new Promise((resolve, reject) => {
            this.db.run(`DELETE FROM ${tableName} WHERE id = ?`, [ID], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ id: ID });
                }
            });
        });
    }

    guncelleID(table, ID,obj) {
        let keys= Object.keys(obj);
        let value = Object.values(obj) ;
        let toplam = keys.length;

        let sorgu = [];

        for(let x=0; x < toplam; x++){

            sorgu.push(` ${keys[x]}= "${value[x]}"  `);
        }

       console.log(sorgu.join())
        
        

        return new Promise((resolve, reject) => {
            this.db.run(`UPDATE ${table} SET  ${sorgu.join()}  WHERE ID = ${ID}` , function(err) {
                if (err) {
                    reject(err);
                } else {
                    obj.ID = ID;
                    resolve(obj);
                }
            });
        });
      
    }


}

const vt = new veritabani("akillipano.db");
module.exports = vt;

/*



vt.guncelleID("user",3,{
    panoName:"Osmanpaşa",
    user:"safiye",
    password:"6642000",
    adres:"son adres",
     durum:0,
}).then(  (da)=>{
        console.log(da)
})

/*


vt.ekle("user",{
    panoName:"Tophisar",
    user:"safiye",
    password:"6642000",
    adres:"son adres",
     durum:0,
}).then((data)=>{
    console.log(data)
}).catch((err)=>{
    console.log(err)
})



vt.silID("user",2).then((sil)=>{
        console.log(sil)
});


/*
// listeleme 
vt.list(`select * from user where ID = "2"`).then((data)=>{
                console.log(data)
    })  






 /*

 
 */


db.close();