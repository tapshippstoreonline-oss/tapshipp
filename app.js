/* TAPSHIPP storefront frontend.
   Set API_URL to the deployed Google Apps Script web app URL.
   Leave it blank to run the storefront in demo mode using local sample products. */
const API_URL = "https://script.google.com/macros/s/AKfycbw1oaSik-8vD_kEl2yNKWTU5HUbQT-3zQ-RImWyMGszb1IpcaTAVLHKpWANUIYNGNkz/exec"; // Apps Script /exec URL
const RAZORPAY_KEY_ID = "rzp_live_TgLVSTx6twXbmO"; // Key ID is public; NEVER put Key Secret here
const CURRENCY = "INR";
const STORE_DELIVERY_NOTE = "Delivery charges confirmed by store";
const SAMPLE_PRODUCTS = [
  {id:"TS1001",name:"Everyday Travel Backpack",brand:"TAPSHIPP Select",category:"Bags",price:899,mrp:1299,description:"A practical everyday backpack for commuting, travel and daily essentials.",features:["Spacious main compartment","Comfortable adjustable shoulder straps","Useful front organiser pocket"],specifications:"Material: Polyester | Capacity: 25 L | Colour: As shown",stock:18,images:["https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=900","https://images.unsplash.com/photo-1622560480654-d96214fdc887?w=900"],delivery:"Delivery estimate and charge will be confirmed after order.",returns:"Return eligibility is subject to the final store policy.",warranty:"As specified by the supplier."},
  {id:"TS1002",name:"Classic Wireless Headphones",brand:"TAPSHIPP Select",category:"Electronics",price:1199,mrp:1699,description:"Comfort-focused wireless headphones for music, calls and everyday use.",features:["Wireless connectivity","Soft over-ear cushions","Foldable design"],specifications:"Connectivity: Bluetooth | Type: Over-ear | Colour: As shown",stock:12,images:["https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=900"],delivery:"Delivery estimate and charge will be confirmed after order.",returns:"Return eligibility is subject to the final store policy.",warranty:"As specified by the supplier."},
  {id:"TS1003",name:"Minimal Desk Organizer",brand:"TAPSHIPP Home",category:"Home & Living",price:449,mrp:699,description:"Keep your everyday desk essentials organised with a clean, compact design.",features:["Compact desk footprint","Multiple storage sections","Suitable for home or office"],specifications:"Material: Confirm with supplier | Size: Confirm with supplier",stock:25,images:["https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=900"],delivery:"Delivery estimate and charge will be confirmed after order.",returns:"Return eligibility is subject to the final store policy.",warranty:"As specified by the supplier."},
  {id:"TS1004",name:"Insulated Water Bottle",brand:"TAPSHIPP Select",category:"Lifestyle",price:599,mrp:899,description:"A reusable bottle designed for daily hydration at work, school or travel.",features:["Reusable everyday design","Easy to carry","Simple screw lid"],specifications:"Capacity: Confirm with supplier | Material: Confirm with supplier",stock:30,images:["https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=900"],delivery:"Delivery estimate and charge will be confirmed after order.",returns:"Return eligibility is subject to the final store policy.",warranty:"As specified by the supplier."}
];
const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=900";
let products = [];
let activeCategory = "all";
let searchTerm = "";
let currentProduct = null;
let detailQty = 1;

const $ = (s, root=document) => root.querySelector(s);
const money = n => new Intl.NumberFormat("en-IN",{style:"currency",currency:CURRENCY,maximumFractionDigits:2}).format(Number(n)||0);
const safe = value => String(value ?? "").replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const getCart = () => { try{return JSON.parse(localStorage.getItem("tapshipp_cart")||"[]");}catch{return [];} };
const saveCart = cart => { localStorage.setItem("tapshipp_cart",JSON.stringify(cart)); updateCartCount(); };
const updateCartCount = () => { const n=getCart().reduce((s,x)=>s+Number(x.qty||0),0); const el=$("#cartCount"); if(el)el.textContent=n; };
const productImage = p => (p.images && p.images[0]) || p.image || FALLBACK_IMAGE;
function normalizeProduct(p){
  return {id:String(p.id??p.productId??""),name:String(p.name??p.productName??"Unnamed product"),brand:String(p.brand??""),category:String(p.category??"General"),price:Number(p.price??p.sellingPrice??0),mrp:Number(p.mrp??p.price??p.sellingPrice??0),description:String(p.description??""),features:Array.isArray(p.features)?p.features:(p.features?String(p.features).split("|").map(x=>x.trim()).filter(Boolean):[]),specifications:String(p.specifications??""),stock:Number(p.stock??0),images:Array.isArray(p.images)?p.images.filter(Boolean).slice(0,5):(p.image?[p.image]:[]),delivery:String(p.delivery??p.deliveryInfo??STORE_DELIVERY_NOTE),returns:String(p.returns??p.returnPolicy??"Please contact the store for return eligibility."),warranty:String(p.warranty??"Please refer to supplier warranty terms.")};
}
// Product cache: show the last successful product list immediately on repeat visits.
// The cache is only for storefront display; the backend must re-check price and stock at checkout.
const PRODUCT_CACHE_KEY = "tapshipp_products_cache_v1";
const PRODUCT_CACHE_MAX_AGE = 10 * 60 * 1000; // 10 minutes

function readProductCache(){
  try{
    const saved=JSON.parse(localStorage.getItem(PRODUCT_CACHE_KEY)||"null");
    if(saved && Array.isArray(saved.products)){
      return {
        products:saved.products.map(normalizeProduct),
        savedAt:Number(saved.savedAt)||0
      };
    }
  }catch(e){
    console.warn("TAPSHIPP product cache could not be read.",e);
  }
  return null;
}

function writeProductCache(list){
  try{
    localStorage.setItem(PRODUCT_CACHE_KEY,JSON.stringify({
      savedAt:Date.now(),
      products:list
    }));
  }catch(e){
    // Storage may be unavailable or full; the live storefront can still work.
    console.warn("TAPSHIPP product cache could not be saved.",e);
  }
}

async function fetchFreshProducts(){
  if(!API_URL) return SAMPLE_PRODUCTS.map(normalizeProduct);

  const response=await fetch(`${API_URL}?action=products`,{
    method:"GET",
    cache:"no-store"
  });
  if(!response.ok) throw new Error("Product service unavailable");
  const data=await response.json();
  if(!data.success || !Array.isArray(data.products)){
    throw new Error(data.message||"Invalid product response from store.");
  }
  return data.products.map(normalizeProduct);
}

function renderCurrentPage(){
  const page=document.body.dataset.page;
  if(page==="home") renderHome();
  if(page==="product") renderProduct();
  if(page==="checkout") renderCheckout();
}

async function refreshProductsInBackground(){
  // Refresh even when the cache is fresh so inventory and product edits are picked up.
  // This runs after the cached page has already become usable.
  try{
    const fresh=await fetchFreshProducts();
    const changed=JSON.stringify(fresh)!==JSON.stringify(products);
    products=fresh;
    writeProductCache(fresh);
    if(changed){
      renderCurrentPage();
      updateCartCount();
    }
  }catch(e){
    console.warn("TAPSHIPP background product refresh failed; keeping the last available product list.",e);
  }
}

async function loadProducts(){
  const cached=readProductCache();
  if(cached){
    products=cached.products;
    // Avoid another Apps Script request while the cached catalogue is still fresh.
    // If it is older than the cache window, display it first and refresh in the background.
    if(!cached.savedAt || Date.now()-cached.savedAt>PRODUCT_CACHE_MAX_AGE){
      refreshProductsInBackground();
    }
    return products;
  }

  // First visit or cleared browser storage: fetch the live catalogue.
  try{
    const fresh=await fetchFreshProducts();
    writeProductCache(fresh);
    return fresh;
  }catch(e){
    console.warn("TAPSHIPP API unavailable; using demo products.",e);
    return SAMPLE_PRODUCTS.map(normalizeProduct);
  }
}
function discount(p){return p.mrp>p.price?Math.round((p.mrp-p.price)/p.mrp*100):0;}
function cardHTML(p){
  const off=discount(p);
  return `<article class="product-card"><a class="product-image-link" href="product.html?id=${encodeURIComponent(p.id)}"><img src="${safe(productImage(p))}" alt="${safe(p.name)}" loading="lazy" decoding="async" onerror="this.src='${FALLBACK_IMAGE}'">${off?`<span class="discount-tag">${off}% OFF</span>`:""}</a><div class="product-card-body"><div class="product-category">${safe(p.category)}</div><h3><a href="product.html?id=${encodeURIComponent(p.id)}">${safe(p.name)}</a></h3><div class="price-row"><span class="price">${money(p.price)}</span>${p.mrp>p.price?`<span class="mrp">${money(p.mrp)}</span>`:""}</div><div class="card-actions"><a class="btn btn-outline" href="product.html?id=${encodeURIComponent(p.id)}">View details</a><button class="btn btn-primary" data-add="${safe(p.id)}" ${p.stock<=0?"disabled":""}>${p.stock<=0?"Sold out":"Add +"}</button></div></div></article>`;
}
function bindAddButtons(root=document){
  root.querySelectorAll("[data-add]").forEach(b=>b.addEventListener("click",()=>addToCart(b.dataset.add,1)));
}
function addToCart(id,qty=1){
  const p=products.find(x=>x.id===id);if(!p)return;
  if(p.stock<=0){alert("This product is currently out of stock.");return;}
  const cart=getCart(),item=cart.find(x=>x.id===id);
  if(item)item.qty=Math.min(item.qty+qty,p.stock);else cart.push({id,qty:Math.min(qty,p.stock)});
  saveCart(cart);alert("Added to your TAPSHIPP cart.");
}
function renderHome(){
  const categories=[...new Set(products.map(p=>p.category).filter(Boolean))];
  const categoryList=$("#categoryList");
  if(categoryList)categoryList.innerHTML=`<button class="category-chip ${activeCategory==="all"?"active":""}" data-category="all">All products</button>`+categories.map(c=>`<button class="category-chip ${activeCategory===c?"active":""}" data-category="${safe(c)}">${safe(c)}</button>`).join("");
  categoryList?.querySelectorAll("[data-category]").forEach(b=>b.addEventListener("click",()=>{activeCategory=b.dataset.category;renderHome();}));
  const sort=$("#sortSelect")?.value||"featured";
  let shown=products.filter(p=>(activeCategory==="all"||p.category===activeCategory)&&(`${p.name} ${p.brand} ${p.category}`.toLowerCase().includes(searchTerm)));
  if(sort==="price-low")shown.sort((a,b)=>a.price-b.price);if(sort==="price-high")shown.sort((a,b)=>b.price-a.price);if(sort==="name")shown.sort((a,b)=>a.name.localeCompare(b.name));
  const grid=$("#productGrid");if(grid){grid.innerHTML=shown.map(cardHTML).join("")||"";bindAddButtons(grid);}
  $("#resultSummary") && ($("#resultSummary").textContent=`Showing ${shown.length} of ${products.length} products`);
  $("#emptyState")?.classList.toggle("hidden",shown.length!==0);
}
function setupHome(){
  const form=$("#searchForm"),input=$("#searchInput");
  form?.addEventListener("submit",e=>{e.preventDefault();searchTerm=(input.value||"").trim().toLowerCase();renderHome();$("#products")?.scrollIntoView({behavior:"smooth"});});
  $("#sortSelect")?.addEventListener("change",renderHome);
  $("#clearFilters")?.addEventListener("click",()=>{activeCategory="all";searchTerm="";if(input)input.value="";renderHome();});
  renderHome();
}
function renderProduct(){
  const id=new URLSearchParams(location.search).get("id");
  currentProduct=products.find(p=>p.id===id)||products[0];
  const root=$("#productDetail");if(!root)return;
  if(!currentProduct){root.innerHTML='<div class="empty-state">Product not found. <a href="index.html">Return to store</a>.</div>';return;}
  const p=currentProduct;$("#crumbName").textContent=p.name;document.title=`${p.name} | TAPSHIPP`;
  const imgs=p.images.length?p.images:[FALLBACK_IMAGE],off=discount(p);
  root.innerHTML=`<div class="gallery"><div class="gallery-main"><img id="mainProductImage" src="${safe(imgs[0])}" alt="${safe(p.name)}" onerror="this.src='${FALLBACK_IMAGE}'"></div><div class="thumbs">${imgs.map((im,i)=>`<button class="thumb ${i===0?"active":""}" data-image="${safe(im)}"><img src="${safe(im)}" alt="Product view ${i+1}" loading="lazy" decoding="async"></button>`).join("")}</div></div><div class="detail-info"><div class="product-category">${safe(p.category)}</div><div class="brand-line">Brand: ${safe(p.brand||"TAPSHIPP")}</div><h1>${safe(p.name)}</h1><div class="detail-price"><span class="price">${money(p.price)}</span>${p.mrp>p.price?`<span class="mrp">${money(p.mrp)}</span><span class="detail-discount">${off}% off</span>`:""}</div><div class="stock ${p.stock<=0?"out":""}">${p.stock>0?`In stock · ${p.stock} available`:"Currently out of stock"}</div><p class="detail-description">${safe(p.description)}</p><h3>Key features & benefits</h3><ul class="feature-list">${(p.features.length?p.features:["Please contact TAPSHIPP for product details."]).map(x=>`<li>${safe(x)}</li>`).join("")}</ul><h3>Product specifications</h3><p class="muted">${safe(p.specifications||"Specifications will be confirmed by the supplier.")}</p><div class="quantity-row"><strong>Quantity</strong><div class="quantity-control"><button id="qtyMinus" type="button">−</button><span id="qtyValue">1</span><button id="qtyPlus" type="button">+</button></div></div><div class="detail-actions"><button class="btn btn-primary" id="detailAdd" ${p.stock<=0?"disabled":""}>Add to cart</button><button class="btn btn-outline" id="buyNow" ${p.stock<=0?"disabled":""}>Buy now</button></div><details class="info-accordion" open><summary>Delivery information</summary><p>${safe(p.delivery)}</p></details><details class="info-accordion"><summary>Return & replacement</summary><p>${safe(p.returns)}</p></details><details class="info-accordion"><summary>Warranty</summary><p>${safe(p.warranty)}</p></details></div>`;
  root.querySelectorAll("[data-image]").forEach(b=>b.addEventListener("click",()=>{$("#mainProductImage").src=b.dataset.image;root.querySelectorAll(".thumb").forEach(t=>t.classList.remove("active"));b.classList.add("active");}));
  $("#qtyMinus").onclick=()=>{detailQty=Math.max(1,detailQty-1);$("#qtyValue").textContent=detailQty;};
  $("#qtyPlus").onclick=()=>{detailQty=Math.min(p.stock||1,detailQty+1);$("#qtyValue").textContent=detailQty;};
  $("#detailAdd").onclick=()=>addToCart(p.id,detailQty);
  $("#buyNow").onclick=()=>{addToCart(p.id,detailQty);location.href="checkout.html";};
  const related=products.filter(x=>x.id!==p.id).slice(0,4),rg=$("#relatedGrid");if(rg){rg.innerHTML=related.map(cardHTML).join("");bindAddButtons(rg);}
}
function renderCheckout(){
  const cart=getCart(),items=cart.map(c=>({p:products.find(p=>p.id===c.id),qty:c.qty})).filter(x=>x.p);
  const empty=$("#checkoutEmpty"),layout=$("#checkoutLayout");
  if(!items.length){empty?.classList.remove("hidden");layout?.classList.add("hidden");return;}
  empty?.classList.add("hidden");layout?.classList.remove("hidden");
  const root=$("#cartItems");
  root.innerHTML=items.map(({p,qty})=>`<div class="cart-row"><img src="${safe(productImage(p))}" alt="${safe(p.name)}"><div><h3>${safe(p.name)}</h3><div class="muted">${money(p.price)} each</div><div class="mini-qty"><button data-dec="${safe(p.id)}">−</button><span>${qty}</span><button data-inc="${safe(p.id)}">+</button></div></div><div class="cart-row-end"><strong>${money(p.price*qty)}</strong><button class="remove-item" data-remove="${safe(p.id)}">Remove</button></div></div>`).join("");
  root.querySelectorAll("[data-dec]").forEach(b=>b.onclick=()=>changeCartQty(b.dataset.dec,-1));
  root.querySelectorAll("[data-inc]").forEach(b=>b.onclick=()=>changeCartQty(b.dataset.inc,1));
  root.querySelectorAll("[data-remove]").forEach(b=>b.onclick=()=>{saveCart(getCart().filter(x=>x.id!==b.dataset.remove));renderCheckout();});
  const subtotal=items.reduce((s,x)=>s+x.p.price*x.qty,0);
  $("#subtotalValue").textContent=money(subtotal);$("#deliveryValue").textContent="Confirmed by store";$("#totalValue").textContent=`${money(subtotal)} + delivery`;
}
function changeCartQty(id,delta){
  const cart=getCart(),p=products.find(x=>x.id===id),item=cart.find(x=>x.id===id);if(!item)return;
  item.qty+=delta;if(item.qty<=0){saveCart(cart.filter(x=>x.id!==id));}else{item.qty=Math.min(item.qty,p?.stock??item.qty);saveCart(cart);}
  renderCheckout();
}
function setupCheckout(){
  $("#clearCart")?.addEventListener("click",()=>{if(confirm("Remove all items from your cart?")){saveCart([]);renderCheckout();}});
  $("#checkoutForm")?.addEventListener("submit",submitOrder);
  renderCheckout();
}
async function submitOrder(e){
  e.preventDefault();
  const msg=$("#checkoutMessage"),btn=$("#placeOrderBtn");
  if(!API_URL || API_URL.includes("PASTE_YOUR")){msg.textContent="Connect your deployed Google Apps Script URL in app.js before accepting payments.";return;}
  if(!RAZORPAY_KEY_ID || RAZORPAY_KEY_ID.includes("PASTE_YOUR")){msg.textContent="Add your Razorpay Live Key ID in app.js before accepting payments.";return;}
  const form=e.currentTarget;if(!form.reportValidity())return;
  const cart=getCart();if(!cart.length){msg.textContent="Your cart is empty.";return;}
  if(typeof Razorpay==="undefined"){msg.textContent="Razorpay Checkout could not load. Check your internet connection and refresh.";return;}
  const fd=new FormData(form),customer=Object.fromEntries(fd.entries());
  const payload={action:"createRazorpayOrder",customer,items:cart.map(x=>({productId:x.id,quantity:Number(x.qty)}))};
  btn.disabled=true;btn.textContent="Preparing secure payment...";msg.textContent="";
  try{
    const response=await fetch(API_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(payload)});
    const result=await response.json();
    if(!response.ok||!result.success)throw new Error(result.message||"Unable to prepare payment. Please try again.");
    const options={
      key:RAZORPAY_KEY_ID,amount:result.amount,currency:result.currency,
      name:"TAPSHIPP",description:"TAPSHIPP order "+result.orderId,
      order_id:result.razorpayOrderId,
      prefill:{name:result.customerName,email:result.email,contact:result.phone},
      notes:{tapshipp_order_id:result.orderId},theme:{color:"#102b4e"},
      handler:async function(paymentResponse){
        btn.disabled=true;btn.textContent="Verifying payment...";
        msg.textContent="Payment received by checkout. Verifying securely with TAPSHIPP...";
        try{
          const verifyResponse=await fetch(API_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({
            action:"verifyRazorpayPayment",orderId:result.orderId,
            razorpay_payment_id:paymentResponse.razorpay_payment_id,
            razorpay_order_id:paymentResponse.razorpay_order_id,
            razorpay_signature:paymentResponse.razorpay_signature
          })});
          const verified=await verifyResponse.json();
          if(!verifyResponse.ok||!verified.success)throw new Error(verified.message||"Payment verification is pending.");
          sessionStorage.setItem("tapshipp_last_order",result.orderId);
          saveCart([]);location.href=`order-success.html?id=${encodeURIComponent(result.orderId)}`;
        }catch(verifyError){
          msg.textContent="Payment was submitted, but TAPSHIPP could not confirm it yet. Do not pay again immediately. Save your payment ID: "+paymentResponse.razorpay_payment_id+". Contact TAPSHIPP support. "+(verifyError.message||"");
          btn.disabled=false;btn.textContent="Retry verification / contact support";
        }
      },
      modal:{ondismiss:function(){btn.disabled=false;btn.innerHTML='Pay securely with Razorpay <span>→</span>';msg.textContent="Payment window closed. Your order is not confirmed unless payment is completed and verified.";}},
      retry:{enabled:true}
    };
    const checkout=new Razorpay(options);
    checkout.on("payment.failed",function(response){
      const reason=response.error&&response.error.description?response.error.description:"Payment failed. Please try another payment method.";
      msg.textContent=reason;btn.disabled=false;btn.innerHTML='Pay securely with Razorpay <span>→</span>';
    });
    checkout.open();
  }catch(err){
    msg.textContent=err.message||"Unable to start payment. Please try again.";
    btn.disabled=false;btn.innerHTML='Pay securely with Razorpay <span>→</span>';
  }
}
async function boot(){
  updateCartCount();
  $("#year")&&($("#year").textContent=new Date().getFullYear());

  products=await loadProducts();
  const page=document.body.dataset.page;
  if(page==="home")setupHome();
  if(page==="product")renderProduct();
  if(page==="checkout")setupCheckout();
}
document.addEventListener("DOMContentLoaded",boot);