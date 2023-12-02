// 如果有问题，将此值改成true
SW_FALLBACK = false;
 
if ('serviceWorker' in navigator) {
  if (!SW_FALLBACK) {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('Service Worker 注册成功！');
      })
      .catch((error) => {
        console.log('Service Worker 注册失败：', error);
      });
  } else {
    navigator.serviceWorker.getRegistration('/').then((reg) => {
      reg && reg.unregister();
      if(reg){
        window.location.reload();
      }
    });
  }
}
