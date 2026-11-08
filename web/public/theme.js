// Tema antes del primer render (igual que el prototipo): evita parpadeo.
(function(){var t=null;try{t=localStorage.getItem('bodegaLV.theme')}catch(e){}if(t!=='dark'&&t!=='mint')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'mint';document.documentElement.dataset.theme=t;})();
