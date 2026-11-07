
 
$(document).ready( async ()=>{
   
  
    inputcek( );
  
  })


  let inputcek= async ( )=>{

    let inputs=  await axios.get("profil/input");

  
   
     const uniqueTypes = new Set();
     const uniqueItems = [];
     
     inputs.data.forEach(item => {
        
       if (item.durum === 1 && !uniqueTypes.has(item.tipi)) {
        uniqueTypes.add(item.tipi);
        uniqueItems.push(item);   
     
       }
     });
     
            uniqueItems.forEach(input=>{
                let durum = 0
                $(".orta").append(`
                <div class="input"><a class="komponat gruplar" onclick="return gruplarListele(event)"      href="#"><img id="${input.tipi}"  output='${JSON.stringify(input)}'  width="100" src="/img/${input.tipi}${durum}.svg"   tabindex="-1"  ></a>
                <h3>${input.tipi}</h3>
                    </div>
                `)

            })
     
     

  }
 
let  gruplarListele = async (event)=>{
    let inputs=  await axios.get("profil/input");
    $(".input").hide()

    let tipi = $(event.target).attr("id")
    console.log(tipi)
    let gruplar= []
    inputs.data.forEach(input=>{
        if(input.tipi==tipi){
            gruplar.push(input) 
        }
       
    })
    gruplar.forEach(urun=>{
        if(urun.durum==1){
            let durum = kompenant(urun);
            $(".orta").append(`
            <div class="input"><a class="komponat" onclick="return inputClick(event)"   href="#"><img id="in${urun.ID}"  output='${JSON.stringify(urun)}'  width="100" src="/img/${urun.tipi}${durum.durum}.svg"   tabindex="-1"  ></a>
            <h3>${urun.adi}</h3>
                </div>
            `)
        }

    })

}





 function inputClick(event){
    let cek = $(event.target).attr("output")
    socket.emit("start",cek)

    socket.on("input",(gelenData)=>{
        let durum = kompenant(gelenData);
        $("#in"+gelenData.ID).attr("output",JSON.stringify(gelenData))
        $("#in"+gelenData.ID).attr("src",`/img/${gelenData.tipi}${durum.durum}.svg`)   
       
        console.log(cek)
     
    })
    event.preventDefault()
   
 }


 socket.on("anahtar",(aData)=>{

        console.log(aData)
 })