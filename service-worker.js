const CACHE_NAME = 'image-cache-v1';
const IMAGE_CACHE_DURATION = 10 * 24 * 60 * 60 * 1000; // 10 days in milliseconds

// Cache busting timestamp stored with each cached image
const CACHE_METADATA_STORE = 'image-cache-metadata';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Only cache GET requests for image files
  if (event.request.method !== 'GET') {
    return;
  }
  
  const isImage = /\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i.test(url.pathname);
  
  if (!isImage) {
    return;
  }
  
  event.respondWith(
    (async () => {
      try {
        // Check if image is in cache and still valid
        const cachedResponse = await caches.match(event.request);
        
        if (cachedResponse) {
          const cacheTime = await getCacheTime(event.request.url);
          const now = Date.now();
          
          if (cacheTime && (now - cacheTime) < IMAGE_CACHE_DURATION) {
            return cachedResponse;
          } else {
            // Cache expired, remove it
            await caches.delete(CACHE_NAME);
          }
        }
        
        // Fetch from network
        const networkResponse = await fetch(event.request);
        
        if (networkResponse && networkResponse.status === 200) {
          // Clone and cache the response
          const clonedResponse = networkResponse.clone();
          const cache = await caches.open(CACHE_NAME);
          await cache.put(event.request, clonedResponse);
          await setCacheTime(event.request.url, Date.now());
        }
        
        return networkResponse;
      } catch (error) {
        console.error('Service Worker fetch error:', error);
        // Return cached response if available, even if expired
        const cachedResponse = await caches.match(event.request);
        return cachedResponse;
      }
    })()
  );
});

// Helper to store cache timestamp in IndexedDB
async function setCacheTime(url, timestamp) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CACHE_METADATA_STORE, 1);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('urls')) {
        db.createObjectStore('urls', { keyPath: 'url' });
      }
    };
    
    request.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction('urls', 'readwrite');
      const store = transaction.objectStore('urls');
      store.put({ url, timestamp });
      db.close();
      resolve();
    };
    
    request.onerror = () => reject(request.error);
  });
}

// Helper to retrieve cache timestamp from IndexedDB
async function getCacheTime(url) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CACHE_METADATA_STORE, 1);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('urls')) {
        db.createObjectStore('urls', { keyPath: 'url' });
      }
    };
    
    request.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction('urls', 'readonly');
      const store = transaction.objectStore('urls');
      const query = store.get(url);
      
      query.onsuccess = () => {
        const result = query.result;
        db.close();
        resolve(result ? result.timestamp : null);
      };
      
      query.onerror = () => {
        db.close();
        resolve(null);
      };
    };
    
    request.onerror = () => resolve(null);
  });
}
