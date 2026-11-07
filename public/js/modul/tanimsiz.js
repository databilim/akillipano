 

 

$(document).ready( async ()=>{
   
  
    inputcek();
  
  })




  let inputcek = async ()=>{

    let inputs=  await axios.get("profil/input");

 
        inputs.data.forEach(input => {
        let buton = "tanimsiz";
           if(input.durum==0){
            $(".orta").append(`
        
            <div class="input"><a class="komponat" data-toggle="modal" data-target="#tanimsiz${input.ID}"    href="#"><img width="100" src="/img/${buton}.svg"   tabindex="-1"  ></a>
                        <h3>${input.adi}</h3>
            </div>





                    <div class="modal fade" id="tanimsiz${input.ID}" tabindex="-1" aria-labelledby="tanimsiz${input.ID}" aria-hidden="true">
                    <div class="modal-dialog">
                      <div class="modal-content">
                        <div class="modal-header">
                          <h5 class="modal-title" id="exampleModalLabel">${input.adi} Buton</h5>
                          <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                            <span aria-hidden="true">&times;</span>
                          </button>
                        </div>
                        <div class="modal-body">
                         
                          <form id="inputForm${input.ID}" onsubmit="return inputTanimla(event)" action="#" method="post">
                          <div class="form-group">
                             <label for="exampleFormControlInput1">İnput Adı Giriniz</label>
                             <input type="text" class="form-control" id="exampleFormControlInput1" name="adi" placeholder="input adı" value="${input.adi}">
                         </div>
                          <div class="form-group">
                          <label for="exampleFormControlSelect1">Tipi</label>
                          <select class="form-control" name="tipi" id="exampleFormControlSelect1">
                            <option value="lamba">Lamba</option>
                            <option  value="zil"> Zil</option>
                            <option  value="priz" >Priz</option>
                            <option value="alarm" >Alarm</option>
                            <option value="yangin">Yangın</option>
                          </select>
                        </div>
                        
                        

                        <div class="form-group">
                             <label for="exampleFormControlInput1"> İnput Adres</label>
                             <input type="text" class="form-control" id="exampleFormControlInput1" name="adres" placeholder="input adı" value="${input.adres}">
                         </div>
                           
                         <div class="form-group">
                            <label for="exampleFormControlInput1"> Durum</label>
                             <input type="text" class="form-control" id="exampleFormControlInput1" name="durum" placeholder="input adı" value="${input.durum}">
                         </div>
                         <div class="form-group">
                            <label for="exampleFormControlTextarea1">Çıkışlar</label>
                            <textarea class="form-control" name="output"   rows="3">${input.output}</textarea>
                        </div>
                            <input type="hidden" name="ID" value="${input.ID}">
                            <input class="btn btn-primary"  type="submit" value="asdas">

                        </form>
                        
                        </div>
                       
                      </div>
                    </div>
                  </div>



            
            `)
           }     
          
        });
      

       
  }


  let inputTanimla = async (event)=>{
         event.preventDefault();
         let form = $(event.target).attr("id")
         //console.log(form)
        // Form verilerini JSON formatına dönüştür
        var formData = $('#'+form).serializeArray();
        var jsonData = {};
        $(formData).each(function(index, obj){
            jsonData[obj.name] = obj.value;
        });

     let guncelle = await    axios.post("/profil/input",jsonData);
      
        window.location.reload()
        // Axios ile JSON verilerini sunucuya gönder
        
 
       
  }