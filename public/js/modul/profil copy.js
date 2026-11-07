
 
$(document).ready( async ()=>{
   
  
    inputcek( );
  
  })


  let inputcek= async ( )=>{

    let inputs=  await axios.get("profil/input");

  
    inputs.data.forEach(input => {
     
        let durum = kompenant(input);
        if(input.durum==1){
            
            $(".orta").append(`
            <div class="input"><a class="komponat" onclick="return inputClick(event)"   href="#"><img id="in${input.ID}"  output='${JSON.stringify(input)}'  width="100" src="/img/${input.tipi}${durum}.svg"   tabindex="-1"  ></a>
            <h3>${input.adi}</h3>
                </div>
            `)
        }
           
     });
  }
 

 function inputClick(event){
    let cek = $(event.target).attr("output")
    socket.emit("start",cek)

    socket.on("input",(gelenData)=>{
        let durum = kompenant(gelenData);
        $("#in"+gelenData.ID).attr("output",JSON.stringify(gelenData))
        $("#in"+gelenData.ID).attr("src",`/img/${gelenData.tipi}${durum}.svg`)   
       

     
    })
    event.preventDefault()
   
 }


 socket.on("anahtar",(aData)=>{

        console.log(aData)
 })