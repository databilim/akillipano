

$(document).ready( async () =>{
   let user = await axios.get("/profil");

         console.log(user)
      if(user.data.status!=0){
         window.location.href = "/profil.html";
      }

  
   $('#loginForm').submit(function(event) {
        // Formun varsayılan gönderimini engelle
        event.preventDefault();
        
        // Form verilerini JSON formatına dönüştür
        var formData = $(this).serializeArray();
        var jsonData = {};
        $(formData).each(function(index, obj){
            jsonData[obj.name] = obj.value;
        });


     
        // Axios ile JSON verilerini sunucuya gönder
        axios.post('/login', jsonData)
          .then(function(response) {
         if(response.data.status==0){
            alert(response.data.message)
         }
         else if(response.data.status==1){
            window.location.href = "/profil.html"
         }
         else{
            alert("Lütfen tekrar deneyiniz")
         }
            // Başarılı yanıt işlemleri burada gerçekleştirilebilir
          })
          .catch(function(error) {
            console.error(error);
            // Hata durumunda gerçekleştirilecek işlemler burada yapılabilir
          }); 
      });

    console.log("sayfa yüklendi")
   
})



