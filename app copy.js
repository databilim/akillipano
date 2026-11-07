
const moment = require("moment");
const axios = require('axios');
const os = require('os');
 
const express = require('express');
const session = require('express-session');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const app = express();


const server = http.createServer(app);
const io = socketIo(server);
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const lib = require('./modul/i2c');
const db = require("./modul/sqlite.js");


 // Burası express  session 
app.use(session({
    secret: 'secret-key',
    resave: false,
    saveUninitialized: true
}));

const login = require('./router/login');
const profil = require('./router/profil');

app.use('/login', login);
app.use('/profil', profil);




 



let isButtonPressed = false;



setInterval( async () => {
    var input1 = lib.searchButtonType(lib.i2cDataOku(10));

    if (input1) {

        if (!isButtonPressed) {
            console.log( {input:input1.input, hex:input1.type, adres:10})
          let inputSor = await  db.list(`select * from input WHERE input = "${input1.input}" `) ;
            if(inputSor.length>0){
                console.log("Bu Buton Daha önce Eklendi")

                if(inputSor[0].durum==0){
                    console.log("Bu Buton tanımsız")
                }else if(inputSor[0].durum==1){

                    console.log("Bu Butona Görevler ata")

                }
            

            }else{
                db.ekle("input",{
                    input:input1.input,
                    hex:input1.type,
                    adres:10,
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


// Socket.IO bağlantısını dinleyin
io.on('connection', (socket) => {
    console.log('Bir kullanıcı bağlandı');

    // Socket.IO olaylarını burada dinleyin/yayınlayın
});




app.listen(80,()=>{
    let lkalip = os.networkInterfaces()["wlan0"][0].address;
    console.log(`http://${lkalip}`);
    
});


