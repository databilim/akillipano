const express = require('express');
const moment = require("moment");
const axios = require('axios');
const os = require('os');
const session = require('express-session');
const http = require('http');
const socketIo = require('socket.io');
//const io = require('socket.io-client');
const path = require('path');


const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Sunucuyu başlatmak için kullanılacak port
const PORT = process.env.PORT || 80;

// Static dosyaları sunmak için Express middleware'i kullanın
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const lib = require('./modul/i2c');
const db = require("./modul/sqlite.js");
//const hd = require("./modul/havadurumu.js");
const aktif = require("./modul/aktifolanlar.js")(io);

 // Burası express  session 
 app.use(session({
    secret: 'secret-key',
    resave: false,
    saveUninitialized: true
}));

const login = require('./router/login');
const profil = require('./router/profil');
const { json } = require('body-parser');

app.use('/login', login);
app.use('/profil', profil);

let isButtonPressed = false;

// Socket.IO bağlantısını dinleyin


io.on('connection', (socket) => {

    console.log('a user connected', socket.id);
    socket.on('disconnect', () => {
      console.log('user disconnected',socket.id);
    });


 

    socket.on("start", async (out)=>{
        let inputSor = JSON.parse(out)
        //console.log(inputSor)
        let outputs = JSON.parse(inputSor.output)
       if(inputSor.status=="0"){
          
                outputs.forEach((ac)=>{

                  console.log("aktif olan açılışta ",ac )
                    lib.i2cDataGonder(100,`${9+ac}${1}`) 
                     db.guncelleID("io",inputSor.ID,{
                        status:1
                     }).then((gdata)=>{
                        inputSor.status=1
                        io.emit("input",inputSor)
                            console.log(gdata)
                     })
                })
       }else if(inputSor.status=="1"){
        outputs.forEach((ac)=>{

            console.log("aktif olan açılışta ",ac )
            lib.i2cDataGonder(100,`${9+ac}${0}`) 
             db.guncelleID("io",inputSor.ID,{
                status:0
             }).then((gdata)=>{
                inputSor.status=0
                io.emit("input",inputSor)
                    
             })
        })
 

       }

    })




}) 


setInterval( async () => {
    var input1 = lib.searchButtonType(lib.i2cDataOku(10));

    if (input1) {

        if (!isButtonPressed) {
          
          let inputSor = await  db.list(`select * from io WHERE input = "${input1.input}" `) ;
            if(inputSor.length>0){
                console.log("Bu Buton Daha önce Eklendi")
                let outputs = JSON.parse(inputSor[0].output)
                if(inputSor[0].durum==1){
                    if(inputSor[0].status==0){
                        console.log("Lambayı Aç")


                    await db.guncelleID("io",inputSor[0].ID,{status:1}).then((insor)=>{
                        
                            console.log("sttaus 1 olarak güncellendi")
                        }).catch((err)=>{
                            console.log("sttaus 1 hata")
                        }).finally(()=>{
                            outputs.forEach((ac)=>{
                                lib.i2cDataGonder(100,`${9+ac}${1}`) 
                                //
                            })
                            inputSor[0].status = 1
                            io.emit("input",inputSor[0])
                            console.log("atatus 1 final")
                        })


                    }else if(inputSor[0].status==1){

                        await db.guncelleID("io",inputSor[0].ID,{status:0}).then((insor)=>{
                        
                            console.log("sttaus 0 olarak güncellendi")
                        }).catch((err)=>{
                            console.log("sttaus 0 hata")
                        }).finally(()=>{
                            outputs.forEach((ac)=>{
                                lib.i2cDataGonder(100,`${9+ac}${0}`) 
                                //
                            })
                            inputSor[0].status = 0
                            io.emit("input",inputSor[0])
                            console.log("atatus 0 final")
                        })
                    }
                
                }else{
                        console.log("Tanımsız bir  button bunu tanımla = ",input1)
                }
                   

            }else{
             await   db.ekle("io",{
                    input:input1.input,
                    hex:input1.type,
                    adres:10,
                    status:0,
                    durum:0
                })



            }

       
            isButtonPressed = true;
             
            setTimeout(() => {
                // Belirli bir süre sonra isButtonPressed'i sıfırla
         
                isButtonPressed = false;
            }, 1000); // Örnek olarak 1 saniye boyunca başka basışları göz ardı et
        
        }

    }

},100)



 


// Sunucuyu başlatın
server.listen(PORT, () => {
    console.log(`Sunucu ${PORT} numaralı portta başlatıldı`);
});
