import {getItemArt} from './item-art.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const CATEGORIES=[['all','全部'],['food','食物'],['drink','饮品'],['tools','道具'],['basket','待结账']];
const categoryOf=item=>item.paid===false?'basket':['umbrella','wrappers','receipt'].includes(item.kind)?'tools':['drink','coffee'].includes(item.kind)?'drink':'food';

export function inventoryGroups(state){
 if(!state)return [];
 const owned=(state.inventoryItems||state.inventory||[]).map(item=>({...item,paid:true}));
 if(state.umbrellaOwned&&!owned.some(item=>item.id==='umbrella'))owned.push({id:'umbrella',kind:'umbrella',name:'透明雨伞',color:'#9dc8c6',paid:true});
 if(state.wrappers>0)owned.push({id:'wrappers',kind:'wrappers',name:'空包装',count:state.wrappers,color:'#a6b6a2',paid:true,canEquip:false,canUse:false});
 if(state.receipt)owned.push({id:'receipt',kind:'receipt',name:'购物小票',color:'#dcd3ad',paid:true,canEquip:false,canUse:false});
 const groups=new Map();
 for(const item of [...owned,...(state.basket||[]).map(item=>({...item,paid:false}))]){
  const category=categoryOf(item),key=`${category}|${item.kind}|${item.name}|${item.price||0}`;
  if(!groups.has(key))groups.set(key,{...item,key,category,count:0,entries:[],equipped:false});
  const group=groups.get(key);group.count+=Number(item.count)||1;group.entries.push(item);
  if(item.id===state.equipmentId||item.id===state.held?.id||(item.id==='umbrella'&&state.umbrellaEquipped)){group.equipped=true;group.equippedId=item.id;}
 }
 return [...groups.values()].sort((a,b)=>a.category.localeCompare(b.category)||a.name.localeCompare(b.name,'zh-CN'));
}

function describe(item,state){
 if(item.paid===false)return '从店内货架取下的商品，还没有结账。可以拿在手里或放进购物篮；到收银台付款后，才会存入背包并可使用。';
 const descriptions={
  umbrella:'便利店借出的透明长柄雨伞。装备后，收拢的伞会自然垂在身侧；按 U 撑开或合拢。收进背包后会腾出双手。',
  drink:'清凉的瓶装饮品。可以先收纳在背包中，或取出拿在手里慢慢饮用。饮用后会留下空包装。',
  coffee:'在店内咖啡机现磨萃取的热咖啡。可以从背包直接饮用，或先取出拿在手中。',
  onigiri:'用海苔包裹的米饭团，一份适合雨夜的简单夜宵。食用后，记得把包装投入街角的垃圾箱。',
  bento:'装有米饭与配菜的便当。已经付款，可以从背包直接食用，也可以取出后按 R 使用。',
  snack:'一份适合逛店和散步时享用的小零食。可以随时收进背包，之后再取出或使用。',
  oden:'温热的关东煮，装在方便携带的小碗里。食用后，空包装仍会留在随身物品中。',
  icecream:'从冰柜中取出的冰淇淋。可以从背包直接使用，或先拿在手中。',
  wrappers:'吃完、喝完后留下的空包装。到街角分类垃圾箱旁按 F 投放，就能清理这些杂物。',
  receipt:'最近一次在收银台购物的小票，记录购买的商品、支付金额和剩余零钱。'
 };
 return descriptions[item.kind]||'在雨夜街角收集到的随身物品。';
}

export function createInventoryUI({mount,onClose,onEquip,onStow,onUse,onToggleUmbrella}){
 const panel=document.createElement('section');panel.className='inventory-view';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-labelledby','inventory-title');
 panel.innerHTML=`<div class="inv-shell"><header class="inv-header"><div><span class="inv-emblem" aria-hidden="true">▦</span><h2 id="inventory-title">背包</h2><span class="inv-subtitle">雨宿り · 随身物品</span></div><div class="inv-header-right"><span class="inv-wallet"></span><button class="inv-close" aria-label="关闭背包">×</button></div></header><div class="inv-toolbar"><nav class="inv-categories" aria-label="物品分类">${CATEGORIES.map(([id,label])=>`<button data-category="${id}" aria-pressed="false">${label}<span></span></button>`).join('')}</nav><label class="inv-search"><span aria-hidden="true">⌕</span><input type="search" placeholder="搜索物品" aria-label="搜索物品"></label></div><div class="inv-body"><div class="inv-items-pane"><div class="inv-section-label"></div><div class="inv-grid" aria-label="背包物品"></div><div class="inv-empty" hidden></div></div><aside class="inv-detail" aria-label="物品详情"></aside></div><footer class="inv-footer"><div><span class="inv-ownership"></span><small class="inv-equipped"></small></div><button class="inv-return"><kbd>B</kbd> 返回场景</button></footer></div>`;
 mount.append(panel);const $=s=>panel.querySelector(s);
 let state=null,groups=[],category='all',query='',selectedKey=null,opened=false,lastGrid='',lastDetail='',lastData='';
 function visibleGroups(){return groups.filter(item=>(category==='all'?item.category!=='basket':item.category===category)&&(!query||item.name.toLowerCase().includes(query.toLowerCase())));}
 function choose(key,focus=false){selectedKey=key;lastDetail='';render();if(focus){const button=[...$('.inv-grid').querySelectorAll('button')].find(b=>b.dataset.key===key);button?.focus({preventScroll:true});}}
 function selectedId(item){return item.equippedId||item.entries[0]?.id;}
 function render(){
  if(!opened||!state)return;
  $('.inv-wallet').textContent=`¥ ${Number(state.yen||0).toLocaleString('zh-CN')}`;
  const counts=Object.fromEntries(CATEGORIES.map(([id])=>[id,groups.filter(item=>id==='all'?item.category!=='basket':item.category===id).reduce((n,item)=>n+item.count,0)]));
  for(const button of $('.inv-categories').querySelectorAll('button')){button.setAttribute('aria-pressed',String(button.dataset.category===category));button.querySelector('span').textContent=counts[button.dataset.category]||'';}
  $('.inv-ownership').textContent=`持有 ${counts.all||0} 件物品`;
  const equipped=groups.find(item=>item.equipped);$('.inv-equipped').textContent=equipped?`当前手持：${equipped.name}${equipped.paid===false?' · 未付款':''}`:'双手空闲';
  $('.inv-section-label').textContent=category==='basket'?'购物篮 · 结账后自动存入背包':`${CATEGORIES.find(([id])=>id===category)?.[1]||'全部'} · 选择物品查看详情`;
  const filtered=visibleGroups();
  if(!filtered.some(item=>item.key===selectedKey))selectedKey=filtered.find(item=>item.equipped)?.key||filtered[0]?.key||null;
  const gridKey=JSON.stringify(filtered.map(item=>[item.key,item.count,item.equipped,item.color]));
  if(gridKey!==lastGrid){
   lastGrid=gridKey;$('.inv-grid').innerHTML=filtered.map(item=>`<button class="inv-card inv-${item.category}" data-key="${esc(item.key)}" aria-pressed="false" aria-label="${esc(item.name)}，${item.count} 件${item.equipped?'，手持中':''}${item.paid===false?'，未付款':''}"><div class="inv-art"><img src="${getItemArt(item)}" alt="">${item.equipped?'<span class="inv-equipped-badge">手持</span>':''}</div><span class="inv-card-name">${esc(item.name)}</span><span class="inv-card-count">× ${item.count}</span></button>`).join('');
  }
  for(const button of $('.inv-grid').querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.key===selectedKey));
  $('.inv-empty').hidden=filtered.length>0;
  if(!filtered.length)$('.inv-empty').innerHTML=query?'<strong>没有找到这个物品</strong><p>试试其他名称，或清空搜索。</p>':category==='basket'?'<strong>购物篮是空的</strong><p>走近店内商品，按 F 拿取。<br>付款后，商品会自动存入背包。</p>':'<strong>还没有收纳物品</strong><p>在便利店购买食物、饮品，<br>或从门口伞架借一把雨伞。</p>';
  const item=filtered.find(entry=>entry.key===selectedKey);
  const detailKey=JSON.stringify([item?.key,item?.count,item?.equipped,state.umbrella,state.action,state.receipt]);
  if(detailKey===lastDetail)return;lastDetail=detailKey;
  if(!item){$('.inv-detail').innerHTML='<div class="inv-detail-placeholder"><span aria-hidden="true">◇</span><p>选择一个物品</p><small>收纳、取出和使用都会改变实际手持状态。</small></div>';return;}
  const tool=item.kind==='umbrella',passive=['receipt','wrappers'].includes(item.kind),label=item.category==='basket'?'待结账':tool?'道具':item.kind==='receipt'?'记录':item.kind==='wrappers'?'杂物':item.category==='drink'?'饮品':'食物';
  const location=item.paid===false?(item.equipped?'拿在手里 · 未付款':'购物篮 · 未付款'):item.equipped?(tool?(state.umbrella?'已装备 · 撑开':'已装备 · 合拢'):'拿在手里'):'已收纳在背包';
  const source=tool?'便利店门口伞架':item.kind==='receipt'?'便利店收银台':item.kind==='wrappers'?'食用后的包装':String(item.sourceId||item.id).startsWith('vending')?'自动贩卖机':item.kind==='coffee'?'店内现磨咖啡机':'雨宿り便利店';
  const receipt=item.kind==='receipt'&&state.receipt?`<div class="inv-receipt">${state.receipt.items.map(line=>`<div><span>${esc(line.name)}</span><b>¥ ${line.price}</b></div>`).join('')}<div class="inv-receipt-total"><span>合计</span><b>¥ ${state.receipt.total}</b></div><div><span>支付后余额</span><b>¥ ${state.receipt.balance}</b></div></div>`:'';
  const busy=['eat','drink'].includes(state.action);
  let actions='';
  if(!passive){
   const main=item.equipped?(item.paid===false?'放入购物篮':'收进背包'):(tool?'装备':'拿在手里');
   actions+=`<button class="inv-main-action" data-action="${item.equipped?'stow':'equip'}" aria-label="${main}：${esc(item.name)}" ${busy?'disabled':''}>${main}</button>`;
   if(tool)actions+=`<button class="inv-second-action" data-action="toggle" ${!item.equipped||busy?'disabled':''}>${item.equipped?(state.umbrella?'合拢雨伞':'撑开雨伞'):'装备后可撑伞'}</button>`;
   else actions+=`<button class="inv-second-action" data-action="use" aria-label="使用：${esc(item.name)}" ${item.paid===false||busy?'disabled':''}>${item.paid===false?'结账后可使用':busy?'使用中…':item.category==='drink'?'饮用':'食用'}</button>`;
  }
  $('.inv-detail').innerHTML=`<div class="inv-detail-top inv-${item.category}"><div class="inv-detail-heading"><h3>${esc(item.name)}</h3><span>${label}</span></div><img src="${getItemArt(item)}" alt="${esc(item.name)}"></div><div class="inv-detail-copy"><div class="inv-location ${item.paid===false?'unpaid':''}">${location}<span>数量 ×${item.count}</span></div><p>${describe(item,state)}</p>${receipt}<div class="inv-source"><small>来源</small><span>${source}</span>${Number(item.price)>0?`<b>¥ ${item.price} / 件</b>`:''}</div></div><div class="inv-actions">${actions||'<span>可以在背包中查看这件物品。</span>'}</div>`;
 }
 $('.inv-close').addEventListener('click',onClose);$('.inv-return').addEventListener('click',onClose);
 $('.inv-categories').addEventListener('click',event=>{const button=event.target.closest('button[data-category]');if(!button)return;category=button.dataset.category;selectedKey=null;lastGrid=lastDetail='';render();});
 $('.inv-search input').addEventListener('input',event=>{query=event.target.value;lastGrid=lastDetail='';render();});
 $('.inv-grid').addEventListener('click',event=>{const button=event.target.closest('button[data-key]');if(button)choose(button.dataset.key);});
 $('.inv-detail').addEventListener('click',event=>{const button=event.target.closest('button[data-action]'),item=groups.find(g=>g.key===selectedKey);if(!button||!item||button.disabled)return;const id=selectedId(item);if(button.dataset.action==='equip')onEquip(id);else if(button.dataset.action==='stow')onStow();else if(button.dataset.action==='use')onUse(id);else if(button.dataset.action==='toggle')onToggleUmbrella();});
 panel.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose();return;}
  if(event.key==='Tab'){
   const focusable=[...panel.querySelectorAll('button:not([disabled]),input')].filter(el=>el.offsetParent!==null),first=focusable[0],last=focusable.at(-1);
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
   return;
  }
  const button=event.target.closest('button[data-key]');if(button&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){
   event.preventDefault();event.stopPropagation();const filtered=visibleGroups(),index=filtered.findIndex(item=>item.key===button.dataset.key),columns=Math.max(1,Math.round($('.inv-grid').clientWidth/118));
   const step=event.key==='ArrowLeft'?-1:event.key==='ArrowRight'?1:event.key==='ArrowUp'?-columns:columns;choose(filtered[Math.max(0,Math.min(filtered.length-1,index+step))]?.key,true);
  }
 });
 function update(next){state=next;const data=JSON.stringify([state?.inventoryItems||state?.inventory,state?.basket,state?.equipmentId,state?.held?.id,state?.umbrellaOwned,state?.umbrellaEquipped,state?.wrappers,state?.receipt]);if(data!==lastData){lastData=data;groups=inventoryGroups(state);}render();}
 function setOpen(value,next=state){opened=!!value;panel.hidden=!opened;if(next)update(next);if(opened){query='';$('.inv-search input').value='';if(!groups.some(item=>item.category!=='basket')&&groups.some(item=>item.category==='basket'))category='basket';const equipment=groups.find(item=>item.equipped);if(equipment){category=equipment.category==='basket'?'basket':'all';selectedKey=equipment.key;}lastGrid=lastDetail='';render();$('.inv-close').focus({preventScroll:true});}}
 return {element:panel,update,setOpen,get isOpen(){return opened;}};
}
