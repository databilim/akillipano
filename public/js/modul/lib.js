 


let pano = {};


$(document).ready( async ()=>{
  let user = await axios.get("/profil");

 if(user.data.status != 0){
 
  pano.user = user.data;

  //console.log(user.data)
  }else{
    window.location.href = "/";
  }

  

  setInterval(()=>{
    havaDurumu(".havaDurumu");
  },60*5*1000)
await  havaDurumu(".havaDurumu");


})



let kompenant = (obj)=>{
 console.log(obj)
          if(obj.tipi == "priz"){
              if(obj.status==1){

                return  {durum:0, obj}
              } else  if(obj.status==0){
                return   {durum:1, obj}
              }
          

              
          
          
          }else if(obj.tipi == "zil"){
          
            if(obj.status==1){
             
              setTimeout(()=>{
                console.log("set çalıştı " ,JSON.stringify({output:obj}));
                socket.emit("start",JSON.stringify(obj))
              },3000 )

              return  {durum:1, obj}
              
         
              
            } else  if(obj.status==0){

            
              return   {durum:0, obj}
            }
            





          }else {

            if(obj.status==1){

              return  {durum:1, obj}
            } else  if(obj.status==0){
              return  {durum:0, obj}
            }
        
          }


         
          
        

}

let havaDurumu = async (element)=>{
  $(element).html("Yükleniyor")
    let cek = await axios.post("/profil/hd");
    console.log(cek.data[0])
    $(element).html(cek.data[0].sicaklik)

}



setInterval(()=>{
  $(".time").html(moment().format('DD.MM.YYYY h:mm:ss'))
},1000)