/* The little things left outside a Japanese convenience store after dark. */
export function buildProps(ctx) {
  const { THREE, group, box, cyl, sphere, tube, label, plane, mat, add } = ctx;
  const ink = '#283443', cream = '#e4e5dd', steel = '#81969c', dark = '#263d4c';
  const warm = '#ffe6a3';
  const glow = (c, strength = 1) => ({ emissive: c, emissiveIntensity: strength });
  const ring = (r, thickness, x, y, z, color, ry = 0, rx = 0) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(r, thickness, 6, 28), mat(color));
    m.position.set(x, y, z); m.rotation.set(rx, ry, 0); add(m); return m;
  };
  const line = (a, b, r, c, opts) => tube([a, b], r, c, opts);
  const face = (text, w, h, x, y, z, opts = {}) => label(text, w, h, x, y, z, opts);

  // A luminous vending machine. Its four shelves are individually stocked.
  const vx = -4.65, vz = 2.02;
  box(1.20, 2.26, .77, vx, 1.48, vz, '#c73b4f');
  box(1.12, .12, .86, vx, 2.65, vz, '#e9ddd6');
  box(1.12, .12, .86, vx, .37, vz, '#71333e');
  box(.055, 2.13, .055, vx-.54, 1.51, vz+.415, '#ed7d84');
  box(.055, 2.13, .055, vx+.54, 1.51, vz+.415, '#ed7d84');
  box(.98, 1.20, .07, vx, 1.83, vz+.407, '#cbe6e5', glow('#98d9df', .3));
  face('SODA / COFFEE', 1.04, .20, vx, 2.48, vz+.445,
    { bg:'#f3eddf', fg:'#b82c43', font:'bold 48px sans-serif' });
  const drinks = ['#df7463','#e6c870','#75b9ab','#738fae'];
  for (let row = 0; row < 3; row++) {
    const yy = 2.18-row*.32;
    box(.94,.032,.17,vx,yy-.125,vz+.46,'#f8f0df');
    for (let col = 0; col < 4; col++) {
      const xx = vx-.34+col*.225;
      cyl(.061,.061,.18,xx,yy,vz+.461,drinks[(row+col)%4]);
      cyl(.063,.063,.012,xx,yy+.096,vz+.461,'#e9efeb');
      box(.08,.034,.012,xx,yy,vz+.523,'#eef4e9');
      const button = cyl(.035,.035,.025,xx,yy-.165,vz+.532,'#a5dabc',glow('#b4efc6',.65));
      button.rotation.x = Math.PI/2;
    }
  }
  box(.67,.065,.045,vx-.1,1.155,vz+.451,'#893345');
  face('つめた〜い',.63,.085,vx-.1,1.155,vz+.482,{bg:'#edf4e8',fg:'#29768d'});
  box(.26,.32,.08,vx+.355,.975,vz+.455,'#323947');
  box(.155,.075,.02,vx+.355,1.07,vz+.501,'#9bc9a9',glow('#9bc9a9',.4));
  box(.13,.035,.04,vx+.355,.966,vz+.515,'#101d2a');
  box(.08,.045,.035,vx+.355,.879,vz+.522,'#c3c3b2');
  box(.77,.25,.09,vx-.08,.715,vz+.455,'#202d3a');
  box(.70,.025,.14,vx-.08,.60,vz+.50,'#929796');
  for(let k=0;k<4;k++) box(.73,.017,.025,vx-.07,.438+k*.035,vz+.416,'#6c3945');

  // A pale mint city bicycle parked beside the side wall; no rider.
  const bx = 4.50, fy = .82, front = -.48, rear = -2.00;
  for (const z of [front,rear]) {
    ring(.48,.048,bx,fy,z,'#273844',Math.PI/2);
    ring(.425,.018,bx+.007,fy,z,'#b8c1ba',Math.PI/2);
    for(let s=0;s<7;s++) {
      const a = s*Math.PI/7;
      line([bx+.022,fy+Math.cos(a)*.405,z+Math.sin(a)*.405],
        [bx+.022,fy-Math.cos(a)*.405,z-Math.sin(a)*.405],.007,'#bac8c6');
    }
    const hub=cyl(.055,.055,.14,bx,fy,z,'#a1afab'); hub.rotation.z=Math.PI/2;
    // Short curved metal mudguards catch the street light.
    const arc=[]; for(let i=0;i<10;i++){const a=-1.13+i*2.26/9;arc.push([bx,fy+Math.cos(a)*.545,z+Math.sin(a)*.545]);}
    tube(arc,.033,'#b7d1c2');
  }
  const rearHub=[bx,fy,rear], frontHub=[bx,fy,front];
  const crank=[bx,.76,-1.30], seat=[bx-.07,1.52,-1.58], head=[bx-.07,1.46,-.66];
  const green='#7eb9aa';
  for(const [a,b] of [[rearHub,crank],[crank,seat],[seat,rearHub],[seat,head],[head,crank],[head,frontHub]]) line(a,b,.036,green);
  line([bx-.07,1.46,-.66],[bx-.08,1.83,-.78],.022,steel);
  tube([[bx-.34,1.86,-.70],[bx-.27,1.86,-.82],[bx+.13,1.86,-.82],[bx+.20,1.86,-.70]],.025,steel);
  line([bx-.35,1.86,-.70],[bx-.35,1.86,-.54],.041,'#39454a');
  line([bx+.20,1.86,-.70],[bx+.20,1.86,-.54],.041,'#39454a');
  box(.30,.075,.31,bx-.065,1.62,-1.64,'#543f40');
  line(seat,[bx-.065,1.63,-1.64],.028,steel);
  ring(.14,.024,bx+.06,.77,-1.30,'#bac3bb',Math.PI/2);
  tube([[bx+.09,.77,-1.3],[bx+.20,.70,-1.33],[bx+.29,.70,-1.33]],.018,steel);
  box(.17,.04,.12,bx+.30,.70,-1.33,'#3c4445');
  tube([[bx+.076,.84,-1.27],[bx+.076,.90,-1.98],[bx+.076,.76,-2.0],[bx+.076,.65,-1.3]],.009,'#626f73');
  line([bx,.81,-1.30],[bx+.30,.33,-1.45],.015,steel);
  box(.35,.034,.59,bx,1.35,-2.00,'#829994');
  line([bx+.14,1.35,-2.10],[bx+.09,.86,-2.0],.013,steel);
  line([bx-.14,1.35,-2.10],[bx-.09,.86,-2.0],.013,steel);
  // Open wire basket, with a visible interior and a tiny reflector.
  box(.44,.025,.38,bx-.055,1.35,-.34,'#8c9e9b');
  for(const yy of [1.44,1.60]) {
    tube([[bx-.28,yy,-.54],[bx+.17,yy,-.54],[bx+.17,yy,-.12],[bx-.28,yy,-.12],[bx-.28,yy,-.54]],.012,'#aec1b8');
  }
  for(let k=0;k<4;k++){
    const xx=bx-.26+k*.14;
    line([xx,1.36,-.12],[xx,1.61,-.12],.008,'#9aaba6');
  }
  face('●',.12,.12,bx-.05,1.54,-.104,{fg:'#e6c482',bg:'#8a8e82'});

  // Umbrella stand: folded umbrellas, bent handles and an open steel drip tray.
  const ux=3.35,uz=2.15;
  box(.53,.08,.45,ux,.36,uz,'#657a80');
  for(const dx of [-.23,.23])for(const dz of [-.18,.18]) cyl(.014,.014,.60,ux+dx,.67,uz+dz,'#a8b6b6');
  for(const yy of [.57,.93]) tube([[ux-.25,yy,uz-.21],[ux+.25,yy,uz-.21],[ux+.25,yy,uz+.21],[ux-.25,yy,uz+.21],[ux-.25,yy,uz-.21]],.017,'#8fa5aa');
  const umbrellas=[[-.14,0,'#627b98'],[.09,.09,'#bb827f'],[.13,-.12,'#b5c8c8']];
  for(let i=0;i<umbrellas.length;i++) {
    const [dx,dz,color]=umbrellas[i],xx=ux+dx,zz=uz+dz;
    cyl(.035,.09,.56,xx,.87,zz,color);
    line([xx,.51,zz],[xx,1.43,zz],.011,'#aab5b4');
    tube([[xx,1.42,zz],[xx,1.52,zz],[xx+.06,1.56,zz],[xx+.115,1.51,zz],[xx+.115,1.45,zz]],.022,i===1?'#e9b7a5':'#e2e2d8');
    cyl(.064,.064,.035,xx,.98,zz,i===1?'#a36c6b':'#6c8390');
  }

  // Sorted refuse boxes, each carrying its own pictogram and Japanese category.
  const binTypes=[['#7da298','びん・缶'],['#809bb6','ペットボトル'],['#c4ae86','もえるごみ']];
  for(let i=0;i<3;i++){
    const [color,word]=binTypes[i],z=-3.70-i*.63;
    box(.57,.77,.55,4.35,.73,z,'#b8c5bd');
    box(.63,.13,.61,4.35,1.16,z,color);
    box(.024,.22,.26,4.646,1.00,z,'#334c50');
    face(word,.42,.20,4.651,.71,z,{bg:'#e1e6dc',fg:'#455965',rotationY:Math.PI/2});
    box(.49,.065,.48,4.35,.375,z,'#788e89');
  }

  // A warm corner lamp and discreet Japanese road signs.
  cyl(.18,.23,.12,5.22,.37,3.02,'#3f535b');
  cyl(.076,.104,5.61,5.22,3.18,3.02,'#3e5364');
  tube([[5.22,5.91,3.02],[5.22,6.13,3.02],[5.22,6.26,3.24],[5.22,6.26,3.70]],.068,'#455c6b');
  box(.50,.13,.62,5.22,6.23,3.66,'#314a5a');
  box(.38,.045,.49,5.22,6.147,3.66,warm,glow(warm,2.2));
  box(.18,.21,.14,5.22,4.01,3.02,'#5b707a');
  const signX=5.31,signZ=1.94;
  cyl(.033,.033,2.40,signX,1.53,signZ,'#869ba0');
  const signBack=new THREE.Mesh(new THREE.CylinderGeometry(.33,.33,.045,40),mat('#d8dfcf'));
  signBack.position.set(signX,2.47,signZ);signBack.rotation.x=Math.PI/2;add(signBack);
  const signDisc=new THREE.Mesh(new THREE.CylinderGeometry(.292,.292,.051,40),mat('#34638c'));
  signDisc.position.set(signX,2.47,signZ+.008);signDisc.rotation.x=Math.PI/2;add(signDisc);
  face('→',.49,.38,signX,2.47,signZ+.039,{bg:'#34638c',fg:'#eef0dd'});
  face('一方通行',.70,.20,signX,2.00,signZ+.027,{bg:'#e4e6d7',fg:'#4c626e'});
  face('月見町  3丁目',.98,.24,5.24,3.91,3.13,{bg:'#366979',fg:'#e8eee0'});

  // Galvanized corner rails with warm yellow end reflectors.
  for(const xx of [-1.96,-.25,1.46]) {
    cyl(.048,.058,.61,xx,.64,3.54,'#b6c8c5');
    sphere(.060,xx,.96,3.54,'#d6dfd0');
  }
  box(3.46,.14,.075,-.25,.79,3.54,'#c5d1c7');
  box(3.46,.036,.086,-.25,.86,3.54,'#dce2d5');
  for(const xx of [-1.91,1.41]) box(.10,.085,.015,xx,.79,3.59,'#e9bb68',glow('#e9bb68',.2));
  for(const zz of [-3.05,-1.92,-.79]) {
    cyl(.045,.058,.57,5.58,.615,zz,'#abbdbb');
    sphere(.053,5.58,.917,zz,'#ccd6c9');
  }
  box(.072,.13,2.38,5.58,.77,-1.92,'#bbcfc7');
  for(const zz of [-3.02,-.82])box(.014,.075,.1,5.625,.77,zz,'#dbb976');

  // A pair of utility poles. The wiring stays inside the footprint of the model.
  const poleZ=[2.85,-7.02];
  for(let p=0;p<2;p++) {
    const px=-7.62,pz=poleZ[p],height=p===0?7.55:7.27;
    cyl(.27,.32,.285,px,.183,pz,'#627681');
    cyl(.15,.19,height,px,.30+height/2,pz,'#778888');
    cyl(.177,.191,.76,px,.69,pz,'#596771');
    box(1.72,.12,.12,px,height-.10,pz,'#425865');
    box(1.46,.10,.12,px,height-.77,pz,'#526675');
    for(const off of [-.65,0,.65]){
      cyl(.025,.025,.30,px+off,height+.04,pz,'#adb8b1');
      cyl(.075,.065,.115,px+off,height+.18,pz,'#d1d9cd');
      cyl(.061,.056,.06,px+off,height+.24,pz,'#a0b3ad');
    }
    box(.09,.85,.11,px+.13,2.7,pz,'#8b9b96');
    face(p===0?'月見町':'3-17',.27,.43,px,2.98,pz+.195,{bg:'#456c76',fg:'#e2e8d9'});
    // The familiar diagonal yellow and black warning sleeve.
    box(.30,.70,.047,px,1.07,pz+.179,'#d4b976');
    for(let i=0;i<3;i++){
      const stripe=box(.315,.055,.019,px,.85+i*.18,pz+.21,'#39434a');stripe.rotation.z=-.38;
    }
    if(p===0){
      cyl(.22,.22,.69,px+.36,6.53,pz,'#8b9fa0');
      cyl(.235,.235,.075,px+.36,6.91,pz,'#c1cbbe');
      tube([[px+.36,6.94,pz],[px+.44,7.12,pz],[px+.64,7.29,pz]],.015,'#384755');
      box(.31,.41,.23,px,4.60,pz+.19,'#6e8387');
    }
  }
  for(const offset of [-.65,0,.65]) {
    tube([[-7.62+offset,7.80,2.85],[-7.62+offset,7.19,.4],[-7.62+offset,6.97,-2.1],[-7.62+offset,7.15,-4.6],[-7.62+offset,7.52,-7.02]],.014,'#2c3e52');
  }
  tube([[-7.62,6.75,2.85],[-7.65,6.00,-1.8],[-7.62,6.47,-7.02]],.023,'#344451');
  tube([[-7.62,6.87,2.85],[-7.16,6.00,.2],[-5.68,4.15,-1.25]],.017,'#3a4e5c');

  // Community notices in the narrow alley, kept low enough to reveal the shop.
  const boardX=-6.64,boardZ=-.28;
  for(const xx of [boardX-.52,boardX+.52])box(.06,2.055,.07,xx,1.073,boardZ,'#677f80');
  box(1.27,1.12,.10,boardX,1.76,boardZ,'#6f8684');
  box(1.12,.95,.027,boardX,1.76,boardZ+.066,'#c9c3a5');
  box(1.43,.08,.32,boardX,2.38,boardZ,'#477278');
  face('町内のお知らせ',1.14,.18,boardX,2.30,boardZ+.173,{bg:'#456f73',fg:'#e9e4cd'});
  face('秋まつり\n9月 28日',.43,.52,boardX-.28,1.88,boardZ+.09,{bg:'#e9b785',fg:'#a04e46'});
  face('古本市\n日曜日',.43,.35,boardX+.27,1.96,boardZ+.093,{bg:'#e6e6c9',fg:'#577876'});
  face('お知らせ',.43,.25,boardX+.27,1.54,boardZ+.093,{bg:'#a9c9be',fg:'#476c68'});
  face('TSUKIMI',.43,.20,boardX-.28,1.44,boardZ+.093,{bg:'#d9ddd1',fg:'#688184'});
  for(const dx of [-.40,.40]) sphere(.021,boardX+dx,2.16,boardZ+.12,'#b65455');

  // Outdoor air conditioning, exposed pipes, and neatly stacked delivery crates.
  for(let i=0;i<2;i++) {
    const xx=-5.03+i*1.35,zz=-6.26;
    box(1.22,.25,.76,xx,.170,zz,'#6f8186');
    box(1.04,.70,.53,xx,.73,zz,'#bac9c3');
    box(1.08,.055,.59,xx,1.108,zz,'#d2d7c9');
    for(const dx of [-.35,.35])box(.14,.12,.48,xx+dx,.34,zz,'#7d918e');
    // Fans face the rear; these become visible when orbiting the miniature.
    ring(.232,.027,xx-.17,.75,zz-.28,'#859895');
    ring(.175,.013,xx-.17,.75,zz-.296,'#7c9090');
    const fan=new THREE.Mesh(new THREE.CircleGeometry(.205,24),mat('#627b7e'));
    fan.rotation.y=Math.PI;fan.position.set(xx-.17,.75,zz-.286);add(fan);
    for(let j=0;j<6;j++){
      const a=j*Math.PI/3;
      line([xx-.17+Math.sin(a)*.22,.75+Math.cos(a)*.22,zz-.307],[xx-.17-Math.sin(a)*.22,.75-Math.cos(a)*.22,zz-.307],.007,'#b0bdb6');
    }
    for(let j=0;j<4;j++)box(.17,.02,.023,xx+.32,.67+j*.075,zz-.284,'#849896');
    tube([[xx+.51,.53,zz],[xx+.70,.48,zz],[xx+.71,1.47,-5.67]],.035,'#a6b9b0');
  }
  for(let i=0;i<3;i++){
    const xx=-6.67+(i===2?.53:0),yy=.195+(i===1?.31:0),zz=-3.76;
    box(.48,.29,.54,xx,yy,zz,i===2?'#a98659':'#658f82');
    box(.50,.035,.56,xx,yy+.16,zz,i===2?'#c0a16f':'#92af97');
    for(const dy of [-.075,.06])box(.39,.035,.015,xx,yy+dy,zz+.278,i===2?'#685d46':'#466b63');
    box(.17,.065,.013,xx,yy+.06,zz+.291,'#293f43');
  }
  // A small alley service plaque and water tap finish the back corner.
  face('搬入口',.48,.24,-5.73,1.66,-3.85,{bg:'#dadfcf',fg:'#697b7c',rotationY:-Math.PI/2});
  tube([[-5.82,.48,-4.92],[-5.82,1.15,-4.92],[-6.02,1.15,-4.92]],.025,'#7a9999');
  const tap=cyl(.07,.07,.024,-5.91,1.20,-4.92,'#779594');
  tap.rotation.z=Math.PI/2;
  return { lampPosition: [5.22, 6.06, 3.66], vendingPosition: [vx, 1.8, vz+.6] };
}
