// Affichage du lien "Décompte ST" basé sur la session en cache.
// La valeur addon_decompte_st est mise à jour par refreshSession() côté OT
// pour la visite suivante — pas besoin d'un fetch ici à chaque page.
(function(){
  try{
    var raw=localStorage.getItem('ot_session')||sessionStorage.getItem('ot_session');
    if(!raw)return;
    var sess=JSON.parse(raw);
    if(sess && sess.addon_decompte_st===true){
      document.querySelectorAll('a[href="optimum_trans_decompte_st.html"]').forEach(function(el){el.style.display='';});
    }
  }catch(e){}
})();
