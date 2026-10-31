// Perfiles ficticios. Fuente compartida; el servidor acepta IDs, nunca valores del cliente.
(function(root){
  'use strict';
  const LIMITS={neutral:50,min:1,max:100,spread:.10,trait:.03,maxTraits:2};
  const STATS={speed:'Velocidad',acceleration:'Aceleración',agility:'Agilidad',control:'Control',pass:'Pase',shot:'Tiro',defense:'Defensa',balance:'Equilibrio'};
  const TRAITS={
    croqueta:{name:'Especialista en croqueta',effect:'Mejora la rapidez de croqueta; comparte límite con Agilidad.'},
    bicicleta:{name:'Bicicleta rápida',effect:'Mejora la rapidez de bicicleta; comparte límite con Agilidad.'},
    control:{name:'Control cercano',effect:'Control hasta 3 % mejor: menor separación y seguimiento más firme.'},
    pass:{name:'Pase fuerte',effect:'Velocidad del pase hasta +3 %; comparte límite con Pase.'},
    shot:{name:'Rematador',effect:'Velocidad del tiro hasta +3 %; comparte límite con Tiro.'},
    balance:{name:'Buen equilibrio',effect:'Masa de contacto hasta +3 %; comparte límite con Equilibrio.'},
  };
  const make=(name,values,traits=[])=>({name,stats:Object.fromEntries(Object.keys(STATS).map((k,i)=>[k,values[i]])),traits});
  // Todos suman 400 puntos; sin jugadores reales ni valoraciones oficiales.
  const PROFILES={
    neutral:make('Polivalente',[50,50,50,50,50,50,50,50]),
    organizador:make('Organizador',[45,45,50,65,70,40,45,40],['control','pass']),
    regateador:make('Regateador',[55,60,75,65,40,40,30,35],['croqueta','bicicleta']),
    velocista:make('Velocista',[75,70,55,45,40,45,35,35],['bicicleta']),
    rematador:make('Rematador',[45,40,40,55,45,80,40,55],['shot','balance']),
    defensor:make('Defensor',[40,40,40,50,45,40,75,70],['balance','pass']),
    arquero:make('Arquero',[40,45,45,65,60,30,60,55],['control','balance']),
  };
  const STYLES={
    asociativo:{name:'Circulación',pass:1.15,pressure:.95,width:.9,dribble:.85,slots:['organizador','regateador','defensor','rematador','neutral','velocista']},
    tecnico:{name:'Desborde',pass:.95,pressure:.95,width:1.15,dribble:1.15,slots:['regateador','organizador','velocista','defensor','rematador','neutral']},
    directo:{name:'Juego directo',pass:1.05,pressure:1.1,width:1.05,dribble:.9,slots:['rematador','velocista','defensor','organizador','neutral','regateador']},
    compacto:{name:'Presión compacta',pass:1,pressure:1.15,width:.85,dribble:.9,slots:['defensor','organizador','rematador','regateador','neutral','velocista']},
  };
  const SELECTIONS={ARG:'asociativo',BRA:'tecnico',URU:'compacto',ESP:'asociativo',GER:'directo',FRA:'directo',ITA:'compacto',ENG:'directo',NED:'tecnico',MEX:'tecnico',CRO:'asociativo',COL:'tecnico',POR:'tecnico',GFC:'asociativo',CHI:'compacto',PER:'asociativo',JPN:'asociativo',NGA:'directo',BEL:'tecnico',SWE:'compacto'};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const valid=id=>typeof id==='string'&&Object.hasOwn(PROFILES,id);
  const clean=id=>valid(id)?id:'';
  const style=code=>STYLES[SELECTIONS[code]||'asociativo'];
  const slot=(code,i,kind='field')=>kind==='gk'?'arquero':style(code).slots[i%style(code).slots.length];
  function normalize(p={}){
    const stats={};for(const k in STATS){const v=p.stats?.[k];stats[k]=Number.isFinite(v)?clamp(Math.round(v),1,100):50;}
    const traits=[...new Set(Array.isArray(p.traits)?p.traits:[])].filter(k=>Object.hasOwn(TRAITS,k)).slice(0,LIMITS.maxTraits);
    return {stats,traits};
  }
  function factor(p,key,trait){
    const v=p.stats[key],delta=(v-50)/(v<50?49:50)*LIMITS.spread;
    return 1+clamp(delta+(trait&&p.traits.includes(trait)?LIMITS.trait:0),-LIMITS.spread,LIMITS.spread);
  }
  function build(id){
    id=valid(id)?id:'neutral';const p=normalize(PROFILES[id]),fx={};
    for(const k in STATS)fx[k]=factor(p,k,k);
    fx.croqueta=factor(p,'agility','croqueta');fx.bicicleta=factor(p,'agility','bicicleta');
    return {id,name:PROFILES[id].name,...p,fx};
  }
  function motion(base,p){
    const f=p.fx;return {...base,run:base.run*f.speed,sprint:base.sprint*f.speed,
      gkRun:base.gkRun*f.speed,gkSprint:base.gkSprint*f.speed,
      acc:base.acc*f.acceleration,ballAcc:base.ballAcc*f.acceleration,turn:base.turn*f.agility,ballTurn:base.ballTurn*f.agility,
      croqT:duration(base.croqT,f.croqueta),stepT:duration(base.stepT,f.bicicleta)};
  }
  const duration=(base,f)=>clamp(Math.round(base/f),Math.ceil(base/(1+LIMITS.spread)),Math.floor(base/(1-LIMITS.spread)));
  root.FootballAttributes={LIMITS,STATS,TRAITS,PROFILES,STYLES,SELECTIONS,valid,clean,style,slot,normalize,factor,build,motion};
})(typeof module!=='undefined'?module.exports:window);
