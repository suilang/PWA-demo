const version = 'v2';

const preCacheName = 'pre-cache-' + version;
const runtimeCacheName = 'runtime-cache'; // runtime不进行整体清除

const filesToCache = [];

const maxAgeSeconds = 10;

const debounceClearTime = 20;

// 符合条件也是缓存优先，但是每次都重新发起网络请求更新缓存
const isStaleWhileRevalidate = (request) => {
  const url = request.url;
  const index = [`${self.location.origin}/mock.js`, `${self.location.origin}/index.html`].indexOf(url);
  return index !== -1;
};

/*********************上面是配置代码***************************** */

const addResourcesToCache = async () => {
  return caches.open(preCacheName).then((cache) => {
    return cache.addAll(filesToCache);
  });
};

// 安装Service Worker时进行预缓存
self.addEventListener('install', function (event) {
  event.waitUntil(
    addResourcesToCache().then(() => {
      self.skipWaiting();
    })
  );
});

// 删除上个版本的数据
async function clearOldResources() {
  return caches.keys().then(function (cacheNames) {
    return Promise.all(
      cacheNames
        .filter(function (cacheName) {
          return ![preCacheName, runtimeCacheName].includes(cacheName);
        })
        .map(function (cacheName) {
          return caches.delete(cacheName);
        })
    );
  });
}

// 激活Service Worker
self.addEventListener('activate', function (event) {
  event.waitUntil(
    clearOldResources().finally(() => {
      self.clients.claim();
      clearOutdateResources();
    })
  );
});

// 缓存优先
const isCacheFirst = (request) => {
  const url = request.url;
  const index = filesToCache.findIndex((u) => url.includes(u));
  return index !== -1;
};

function addToCache(cacheName, request, response) {
  try {
    caches.open(cacheName).then((cache) => {
      cache.put(request, response);
    });
  } catch (error) {
    console.error('add to cache error =>', error);
  }
}

async function cacheFirst(request) {
  try {
    return caches
      .match(request)
      .then((response) => {
        if (response) {
          return response;
        }

        return fetch(request).then((response) => {
          // 检查是否成功获取到响应
          if (!response || response.status !== 200) {
            return response; // 返回原始响应
          }

          var clonedResponse = response.clone();
          addToCache(runtimeCacheName, request, clonedResponse);
          return response;
        });
      })
      .catch(() => {
        console.error('match in cacheFirst error', error);
        return fetch(request);
      });
  } catch (error) {
    console.error(error);
    return fetch(request);
  }
}

// 缓存优先，同步更新
async function handleFetch(request) {
  try {
    clearOutdateResources();
    // 尝试从缓存中获取响应
    return caches.match(request).then(function (response) {
      var fetchPromise = fetch(request).then(function (networkResponse) {
        // 检查响应的状态码是否为成功
        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse;
        }
        // 克隆响应并将其添加到缓存中
        var clonedResponse = networkResponse.clone();
        addToCache(runtimeCacheName, request, clonedResponse);

        return networkResponse;
      });

      // 返回缓存的响应，然后更新缓存中的响应
      return response || fetchPromise;
    });
  } catch (error) {
    console.error(error);
    return fetch(request);
  }
}

self.addEventListener('fetch', function (event) {
  const { request } = event;

  if (isCacheFirst(request)) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (isStaleWhileRevalidate(request)) {
    event.respondWith(handleFetch(request));
    return;
  }
});

function debounce(func, delay) {
  let timerId;

  return function (...args) {
    clearTimeout(timerId);

    timerId = setTimeout(() => {
      func.apply(this, args);
    }, delay);
  };
}

const clearOutdateResources = debounce(function () {
  try {
    caches.open(runtimeCacheName).then((cache) => {
      cache.keys().then(function (requests) {
        requests.forEach(function (request) {
          cache.match(request).then(function (response) {
            const isExpired = isExpiredWithTime(response, maxAgeSeconds);
            if (isExpired) {
              cache.delete(request);
            }
          });
        });
      });
    });
  } catch (error) {
    console.error('clearOutdateResources error => ', error);
  }
}, debounceClearTime * 1000);

function isExpiredWithTime(response, time) {
  var requestTime = Date.parse(response.headers.get('date'));
  if (!requestTime) {
    return false;
  }
  var expirationTime = requestTime + time * 1000;

  // 检查当前时间是否超过了缓存的有效期
  if (Date.now() < expirationTime) {
    return false; // 未过期
  }
  return true; // 已过期
}
