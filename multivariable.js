(function(global){
"use strict";

const M=global.CalcMath;
const A=global.CalcAlgebra;
const C=global.CalcCalculus;
const CAS=global.CalcCAS;
if(!M||!A||!C||!CAS)throw new Error("CalcMath, CalcAlgebra, CalcCalculus, and CalcCAS must load before CalcMultivariable");

class MultivariableError extends M.CalcError{
  constructor(code,message,details){super(code||"MULTIVARIABLE_ERROR",message,undefined,undefined,details);}
}
class UnsupportedMultivariableError extends MultivariableError{
  constructor(message,details){super("UNSUPPORTED_MULTIVARIABLE",message,details);}
}
class MultivariableLimitError extends MultivariableError{
  constructor(message,details){super("MULTIVARIABLE_LIMIT_DNE",message||"Multivariable limit does not exist",details);}
}

function rat(n,d){return new M.Rational(BigInt(n),d===undefined?1n:BigInt(d));}
function lit(v){return {type:"literal",value:v,start:0,end:0};}
function id(name){return {type:"identifier",name:name,start:0,end:0};}
function unary(op,arg){return {type:"unary",op:op,arg:arg,start:0,end:0};}
function bin(op,left,right){return {type:"binary",op:op,left:left,right:right,start:0,end:0};}
function call(name,args){return {type:"call",name:name,args:args,start:0,end:0};}
function cloneAst(ast){return M.deserializeAst(M.serializeAst(ast));}
function asExpr(source){return source instanceof A.SymbolicExpression?source:new A.SymbolicExpression(source);}
function simplify(ast){return A.simplifyAst(ast);}
function text(ast){return A.printAst(simplify(ast));}
function zeroAst(ast){var s=simplify(ast);return s.type==="literal"&&M.isZero(s.value);}
function commandResult(display,kind,details){
  details=details||{};
  return {
    value:details.value===undefined?null:details.value,
    display:String(display),approx:details.approx||"",
    exact:details.exact===undefined?true:!!details.exact,
    kind:kind||"multivariable",symbolic:details.symbolic===undefined?true:!!details.symbolic,
    metadata:Object.assign({numericKind:kind||"multivariable",exact:details.exact===undefined?true:!!details.exact,u2:true},details.metadata||{})
  };
}
function splitTopLevel(source,delimiter){
  source=String(source);var out=[],start=0,depth=0;
  for(var i=0;i<source.length;i++){
    var ch=source[i];
    if(ch==="("||ch==="["||ch==="{")depth++;
    else if(ch===")"||ch==="]"||ch==="}")depth--;
    else if(ch===delimiter&&depth===0){out.push(source.slice(start,i).trim());start=i+1;}
  }
  out.push(source.slice(start).trim());
  return out.filter(function(x){return x.length>0;});
}
function splitArgs(source){return splitTopLevel(source,",");}
function parseCall(raw,name){
  var re=new RegExp("^"+name+"\\s*\\((.*)\\)$","s"),m=String(raw).trim().match(re);return m?m[1]:null;
}
function parseVarList(source){
  var vars=splitArgs(source);
  if(!vars.length)throw new MultivariableError("VARIABLE_REQUIRED","At least one variable is required");
  vars.forEach(function(v){if(!/^[A-Za-z_]\w*$/.test(v))throw new MultivariableError("INVALID_VARIABLE","Invalid variable '"+v+"'");});
  return vars;
}
function parseExprList(source){return splitArgs(source).map(asExpr);}
function parseExact(source){
  var ast=M.parseExpression(String(source)),vars=A.collectVariables(ast);
  if(vars.size)throw new MultivariableError("CONSTANT_REQUIRED","Expected a constant expression",{source:source});
  var v=M.evaluateAst(ast,{}, {complex:false,angle:"RAD"},0);
  if(v instanceof M.Complex)throw new MultivariableError("REAL_REQUIRED","Expected a real value");
  return v;
}
function parseNumber(source){var v=parseExact(source),n=M.toNumber(v);if(!Number.isFinite(n))throw new MultivariableError("FINITE_REQUIRED","Expected a finite number");return n;}
function substituteExpr(sourceOrExpr,mapping){
  var expr=asExpr(sourceOrExpr),parsed={};
  Object.keys(mapping||{}).forEach(function(k){
    var value=mapping[k];
    parsed[k]=value instanceof A.SymbolicExpression?cloneAst(value.ast):
      value&&value.type?cloneAst(value):
      typeof value==="string"?M.parseExpression(value):lit(value);
  });
  return new A.SymbolicExpression(simplify(A.substituteAst(expr.ast,parsed)),{restrictions:expr.restrictions});
}
function evalAst(ast,env){
  var v=M.evaluateAst(ast,env||{}, {complex:false,angle:"RAD"},0),n=M.toNumber(v);
  if(!Number.isFinite(n))throw new MultivariableError("NON_FINITE","Evaluation produced a non-finite value");
  return n;
}
function evalExpr(expr,env){return evalAst(asExpr(expr).ast,env);}
function formatVector(items){return "["+items.map(function(x){return x instanceof A.SymbolicExpression?x.toString():String(x);}).join(", ")+"]";}
function vectorExpr(items){return items.map(asExpr);}
function dotAst(a,b){
  if(a.length!==b.length)throw new MultivariableError("SHAPE_ERROR","Vector dimensions do not match");
  var out=lit(rat(0));for(var i=0;i<a.length;i++)out=simplify(bin("+",out,bin("*",cloneAst(a[i].ast||a[i]),cloneAst(b[i].ast||b[i]))));return out;
}
function normAst(v){return call("sqrt",[dotAst(v,v)]);}
function crossAst(a,b){
  if(a.length!==3||b.length!==3)throw new MultivariableError("SHAPE_ERROR","Cross product requires 3D vectors");
  var aa=a.map(function(x){return x.ast||x;}),bb=b.map(function(x){return x.ast||x;});
  return [
    simplify(bin("-",bin("*",cloneAst(aa[1]),cloneAst(bb[2])),bin("*",cloneAst(aa[2]),cloneAst(bb[1])))),
    simplify(bin("-",bin("*",cloneAst(aa[2]),cloneAst(bb[0])),bin("*",cloneAst(aa[0]),cloneAst(bb[2])))),
    simplify(bin("-",bin("*",cloneAst(aa[0]),cloneAst(bb[1])),bin("*",cloneAst(aa[1]),cloneAst(bb[0]))))
  ];
}
function derivativeExpr(expr,variable,order){return C.differentiate(expr,variable,order||1);}
function partials(expr,vars){return vars.map(function(v){return derivativeExpr(expr,v,1);});}
function substitutePoint(expr,vars,values){
  if(vars.length!==values.length)throw new MultivariableError("SHAPE_ERROR","Point dimension does not match variables");
  var map={};vars.forEach(function(v,i){map[v]=values[i];});
  return substituteExpr(expr,map);
}
function exactOrNumber(expr){
  var e=asExpr(expr);
  if(A.collectVariables(e.ast).size)throw new MultivariableError("CONSTANT_REQUIRED","Expected a constant expression");
  return M.evaluateAst(e.ast,{}, {complex:false,angle:"RAD"},0);
}

/* Multivariable differentiation ----------------------------------------- */
function totalDifferential(source,vars){
  var expr=asExpr(source),parts=partials(expr,vars);
  return {
    expression:expr,variables:vars,partials:parts,
    toString:function(){return "d("+expr.toString()+") = "+parts.map(function(p,i){return "("+p.toString()+") d"+vars[i];}).join(" + ");}
  };
}
function directionalDerivative(source,vars,point,direction){
  if(vars.length!==point.length||vars.length!==direction.length)throw new MultivariableError("SHAPE_ERROR","Variables, point, and direction must have the same dimension");
  var expr=asExpr(source),grad=partials(expr,vars),norm=simplify(normAst(direction.map(function(v){return asExpr(v);})));
  var normValue=exactOrNumber(new A.SymbolicExpression(norm));if(M.isZero(normValue))throw new MultivariableError("ZERO_DIRECTION","Direction vector must be nonzero");
  var unit=direction.map(function(v){return new A.SymbolicExpression(simplify(bin("/",asExpr(v).ast,cloneAst(norm))));});
  var at=grad.map(function(g){return substitutePoint(g,vars,point);}),result=new A.SymbolicExpression(simplify(dotAst(at,unit)));
  return {expression:result,gradient:grad,gradientAtPoint:at,unitDirection:unit,variables:vars,point:point,toString:function(){return result.toString();}};
}
function implicitDerivative(source,dependent,independent){
  if(!dependent||!independent||dependent===independent)throw new MultivariableError("VARIABLE_REQUIRED","Implicit differentiation needs distinct dependent and independent variables");
  var F=asExpr(source),Fx=derivativeExpr(F,independent),Fy=derivativeExpr(F,dependent);
  if(zeroAst(Fy.ast))throw new UnsupportedMultivariableError("Implicit derivative denominator is identically zero",{dependent:dependent});
  var result=new A.SymbolicExpression(simplify(bin("/",unary("-",cloneAst(Fx.ast)),cloneAst(Fy.ast))));
  return {expression:result,numerator:Fx,denominator:Fy,dependent:dependent,independent:independent,toString:function(){return "d"+dependent+"/d"+independent+" = "+result.toString();}};
}
function tangentPlane(source,vars,point,zName){
  if(vars.length!==2||point.length!==2)throw new MultivariableError("SHAPE_ERROR","Tangent plane currently requires exactly two independent variables and a 2D point");
  zName=zName||"z";var expr=asExpr(source),f0=substitutePoint(expr,vars,point),grad=partials(expr,vars).map(function(p){return substitutePoint(p,vars,point);});
  var rhs=cloneAst(f0.ast);
  for(var i=0;i<2;i++){
    var shift=simplify(bin("-",id(vars[i]),cloneAst(asExpr(point[i]).ast)));
    rhs=simplify(bin("+",rhs,bin("*",cloneAst(grad[i].ast),shift)));
  }
  var plane=new A.SymbolicExpression(rhs);
  return {expression:plane,value:f0,gradientAtPoint:grad,variables:vars,point:point,toString:function(){return zName+" = "+plane.toString();}};
}
function multiIndices(dim,maxOrder){
  var out=[];
  function rec(prefix,left,pos){
    if(pos===dim-1){for(var k=0;k<=left;k++)out.push(prefix.concat([k]));return;}
    for(var i=0;i<=left;i++)rec(prefix.concat([i]),left-i,pos+1);
  }
  rec([],maxOrder,0);
  return out.filter(function(a){return a.reduce(function(x,y){return x+y;},0)<=maxOrder;});
}
function factorial(n){var v=1n;for(var i=2n;i<=BigInt(n);i++)v*=i;return v;}
function multiTaylor(source,vars,center,order){
  order=Number(order);if(!Number.isInteger(order)||order<0||order>3)throw new MultivariableError("INVALID_ORDER","Multivariable Taylor order must be 0–3");
  if(vars.length!==center.length||vars.length<1||vars.length>3)throw new MultivariableError("SHAPE_ERROR","Taylor expansion supports 1–3 variables with a matching center");
  var expr=asExpr(source),sum=lit(rat(0)),terms=[],indices=multiIndices(vars.length,order);
  indices.sort(function(a,b){return a.reduce((x,y)=>x+y,0)-b.reduce((x,y)=>x+y,0);});
  indices.forEach(function(alpha){
    var d=expr,total=0,den=1n;
    alpha.forEach(function(power,i){for(var k=0;k<power;k++)d=derivativeExpr(d,vars[i]);total+=power;den*=factorial(power);});
    var coeff=substitutePoint(d,vars,center),cAst=simplify(bin("/",cloneAst(coeff.ast),lit(new M.Rational(den)))),mon=lit(rat(1));
    alpha.forEach(function(power,i){
      if(!power)return;
      var shift=simplify(bin("-",id(vars[i]),cloneAst(asExpr(center[i]).ast))),factorAst=power===1?shift:bin("^",shift,lit(rat(power)));
      mon=simplify(bin("*",mon,factorAst));
    });
    var term=total===0?cAst:simplify(bin("*",cAst,mon));sum=simplify(bin("+",sum,term));
    terms.push({multiIndex:alpha.slice(),derivative:d,coefficient:new A.SymbolicExpression(cAst)});
  });
  return {expression:new A.SymbolicExpression(sum),variables:vars,center:center,order:order,terms:terms,toString:function(){return this.expression.toString();}};
}

/* Multivariable limits --------------------------------------------------- */
const CONTINUOUS_CALLS=new Set(["sin","cos","tan","asin","acos","atan","sinh","cosh","tanh","exp","sqrt","ln","log","log10","abs"]);
function structurallyContinuousAt(ast,pointEnv){
  if(ast.type==="literal"||ast.type==="identifier")return true;
  if(ast.type==="unary"||ast.type==="postfix")return structurallyContinuousAt(ast.arg,pointEnv);
  if(ast.type==="binary"){
    if(!structurallyContinuousAt(ast.left,pointEnv)||!structurallyContinuousAt(ast.right,pointEnv))return false;
    if(ast.op==="/"){try{return Math.abs(evalAst(ast.right,pointEnv))>1e-12;}catch(e){return false;}}
    return true;
  }
  if(ast.type==="call"){
    if(!CONTINUOUS_CALLS.has(ast.name)||!ast.args.every(function(a){return structurallyContinuousAt(a,pointEnv);}))return false;
    try{evalAst(ast,pointEnv);return true;}catch(e){return false;}
  }
  return false;
}
function pathEstimate(expr,vars,point,pathFns){
  var ts=[1e-2,5e-3,2e-3,1e-3,5e-4],vals=[];
  for(var ti=0;ti<ts.length;ti++){
    var env={};for(var i=0;i<vars.length;i++)env[vars[i]]=point[i]+pathFns[i](ts[ti]);
    try{vals.push(evalAst(expr.ast,env));}catch(e){return null;}
  }
  if(vals.length<3)return null;
  return vals[vals.length-1]+(vals[vals.length-1]-vals[vals.length-2]);
}
function multivariableLimit(source,vars,point){
  if(vars.length!==point.length||vars.length<2||vars.length>3)throw new MultivariableError("SHAPE_ERROR","Multivariable limit supports 2–3 variables");
  var expr=asExpr(source),pointNums=point.map(parseNumber),env={};vars.forEach(function(v,i){env[v]=pointNums[i];});
  if(structurallyContinuousAt(expr.ast,env)){
    var exact=substitutePoint(expr,vars,point);
    return {type:"finite",exact:true,value:exact,method:"continuity",toString:function(){return exact.toString();}};
  }
  var paths=[];
  for(var axis=0;axis<vars.length;axis++){
    var funcs=vars.map(function(_,i){return i===axis?function(t){return t;}:function(){return 0;};});paths.push({name:"axis-"+axis,fns:funcs});
  }
  if(vars.length===2){
    paths.push({name:"diagonal",fns:[function(t){return t;},function(t){return t;}]});
    paths.push({name:"opposite-diagonal",fns:[function(t){return t;},function(t){return -t;}]});
    paths.push({name:"parabola",fns:[function(t){return t;},function(t){return t*t;}]});
  }else paths.push({name:"diagonal",fns:[function(t){return t;},function(t){return t;},function(t){return t;}]});
  var estimates=paths.map(function(p){return {name:p.name,value:pathEstimate(expr,vars,pointNums,p.fns)};}).filter(function(p){return p.value!==null&&Number.isFinite(p.value);});
  for(var i=0;i<estimates.length;i++)for(var j=i+1;j<estimates.length;j++){
    var scale=Math.max(1,Math.abs(estimates[i].value),Math.abs(estimates[j].value));
    if(Math.abs(estimates[i].value-estimates[j].value)>1e-3*scale){
      throw new MultivariableLimitError("Different paths approach different values",{pathA:estimates[i],pathB:estimates[j]});
    }
  }
  throw new UnsupportedMultivariableError("Limit is not certified by continuity and no path disagreement was proven",{pathEstimates:estimates});
}

/* Critical points and constrained optimization -------------------------- */
function criticalPoints(source,vars){
  if(vars.length!==2)throw new UnsupportedMultivariableError("Critical-point solving is currently certified for two variables");
  var expr=asExpr(source),grad=partials(expr,vars),equations=grad.map(function(g){return g.toString()+" = 0";}),solution;
  try{solution=A.solveLinearSystem(equations,vars);}
  catch(e){
    try{var r=CAS.runCommand("system("+equations.join("; ")+")");solution=r&&r.value;}catch(e2){throw new UnsupportedMultivariableError("Gradient system is outside the certified U2 solver",{equations:equations});}
  }
  return {expression:expr,variables:vars,gradient:grad,solution:solution,toString:function(){return solution.toString();}};
}
function classifyCriticalPoint(source,vars,point){
  if(vars.length!==2||point.length!==2)throw new MultivariableError("SHAPE_ERROR","2D Hessian classification requires two variables and a 2D point");
  var expr=asExpr(source),H=C.hessian(expr,vars),at=H.map(function(row){return row.map(function(e){return substitutePoint(e,vars,point);});});
  var a=exactOrNumber(at[0][0]),b=exactOrNumber(at[0][1]),d=exactOrNumber(at[1][1]),det=M.sub(M.mul(a,d),M.mul(b,b)),detN=M.toNumber(det),aN=M.toNumber(a),classification;
  if(detN>1e-12)classification=aN>0?"local minimum":"local maximum";
  else if(detN<-1e-12)classification="saddle point";
  else classification="inconclusive";
  return {classification:classification,hessian:at,determinant:det,variables:vars,point:point,toString:function(){return classification+"; det(H) = "+M.formatValue(det);}};
}
function lagrangeLinearConstraint(objective,constraint,target,vars){
  if(vars.length!==2)throw new UnsupportedMultivariableError("U2 Lagrange solver currently supports two variables and one linear equality constraint");
  var f=asExpr(objective),g=asExpr(constraint),lambda="lambda",gf=partials(f,vars),gg=partials(g,vars),
    eqs=[
      new A.SymbolicExpression(simplify(bin("-",cloneAst(gf[0].ast),bin("*",id(lambda),cloneAst(gg[0].ast))))).toString()+" = 0",
      new A.SymbolicExpression(simplify(bin("-",cloneAst(gf[1].ast),bin("*",id(lambda),cloneAst(gg[1].ast))))).toString()+" = 0",
      new A.SymbolicExpression(simplify(bin("-",cloneAst(g.ast),cloneAst(asExpr(target).ast)))).toString()+" = 0"
    ];
  var sol;
  try{sol=A.solveLinearSystem(eqs,vars.concat([lambda]));}
  catch(e){throw new UnsupportedMultivariableError("Lagrange equations are not a certified linear system; U2 currently covers quadratic objectives with linear constraints",{equations:eqs});}
  return {objective:f,constraint:g,target:target,variables:vars,solution:sol,equations:eqs,toString:function(){return sol.toString();}};
}

/* Vector fields ---------------------------------------------------------- */
class VectorField{
  constructor(components,variables){
    this.components=components.map(asExpr);this.variables=variables.slice();
    if(this.components.length!==this.variables.length)throw new MultivariableError("SHAPE_ERROR","Vector-field dimension must equal variable dimension");
    if(this.components.length<2||this.components.length>3)throw new MultivariableError("SHAPE_ERROR","U2 vector fields support 2D or 3D");
  }
  divergence(){
    var out=lit(rat(0));for(var i=0;i<this.components.length;i++)out=simplify(bin("+",out,cloneAst(derivativeExpr(this.components[i],this.variables[i]).ast)));
    return new A.SymbolicExpression(out);
  }
  curl(){
    if(this.components.length===2){
      return new A.SymbolicExpression(simplify(bin("-",cloneAst(derivativeExpr(this.components[1],this.variables[0]).ast),cloneAst(derivativeExpr(this.components[0],this.variables[1]).ast))));
    }
    var F=this.components,v=this.variables;
    return [
      new A.SymbolicExpression(simplify(bin("-",cloneAst(derivativeExpr(F[2],v[1]).ast),cloneAst(derivativeExpr(F[1],v[2]).ast)))),
      new A.SymbolicExpression(simplify(bin("-",cloneAst(derivativeExpr(F[0],v[2]).ast),cloneAst(derivativeExpr(F[2],v[0]).ast)))),
      new A.SymbolicExpression(simplify(bin("-",cloneAst(derivativeExpr(F[1],v[0]).ast),cloneAst(derivativeExpr(F[0],v[1]).ast))))
    ];
  }
  toString(){return formatVector(this.components);}
}
function integratePolynomialWithParameters(expr,variable){
  var p;
  try{p=CAS.symbolicPolynomial(asExpr(expr).ast,variable,16);}catch(e){throw new UnsupportedMultivariableError("Potential reconstruction currently requires polynomial field components in the integration variable",{variable:variable});}
  var sum=lit(rat(0));
  for(var d=0;d<p.length;d++){
    if(zeroAst(p[d]))continue;
    var next=d+1,term=next===1?id(variable):bin("^",id(variable),lit(rat(next))),
      coef=simplify(bin("/",cloneAst(p[d]),lit(rat(next))));
    sum=simplify(bin("+",sum,bin("*",coef,term)));
  }
  return new A.SymbolicExpression(sum);
}
function potential(field){
  var F=field instanceof VectorField?field:new VectorField(field.components,field.variables),vars=F.variables,phi=integratePolynomialWithParameters(F.components[0],vars[0]);
  for(var i=1;i<vars.length;i++){
    var have=derivativeExpr(phi,vars[i]),missing=new A.SymbolicExpression(simplify(bin("-",cloneAst(F.components[i].ast),cloneAst(have.ast))));
    var bad=missing.variables().filter(function(v){return vars.slice(0,i).indexOf(v)>=0;});
    if(bad.length)throw new UnsupportedMultivariableError("Field is not conservative under the polynomial potential test",{component:i,residual:missing.toString()});
    if(!zeroAst(missing.ast)){
      var correction=integratePolynomialWithParameters(missing,vars[i]);
      phi=new A.SymbolicExpression(simplify(bin("+",cloneAst(phi.ast),cloneAst(correction.ast))));
    }
  }
  for(var j=0;j<vars.length;j++){
    var check=new A.SymbolicExpression(simplify(bin("-",cloneAst(derivativeExpr(phi,vars[j]).ast),cloneAst(F.components[j].ast))));
    if(!zeroAst(check.ast))throw new UnsupportedMultivariableError("Potential reconstruction failed verification",{variable:vars[j],residual:check.toString()});
  }
  return phi;
}
function conservative(field){
  var curl=field.curl(),zero=Array.isArray(curl)?curl.every(function(c){return zeroAst(c.ast);}):zeroAst(curl.ast),pot=null;
  if(zero){try{pot=potential(field);}catch(e){}}
  return {conservative:zero,potential:pot,curl:curl,toString:function(){return zero?(pot?"conservative; potential = "+pot.toString():"conservative"):"not conservative; curl = "+(Array.isArray(curl)?formatVector(curl):curl.toString());}};
}

/* Numerical integration ------------------------------------------------- */
function adaptiveSimpsonFn(fn,a,b,options){
  options=options||{};var absTol=options.absTol||1e-9,relTol=options.relTol||1e-9,maxDepth=options.maxDepth===undefined?16:options.maxDepth,evaluations=0;
  function ev(x){var y=fn(x);evaluations++;if(!Number.isFinite(y))throw new MultivariableError("NON_FINITE","Integrand is non-finite");return y;}
  if(a===b)return {value:0,errorEstimate:0,evaluations:0};
  var sign=1;if(b<a){var tmp=a;a=b;b=tmp;sign=-1;}
  var fa=ev(a),fb=ev(b),m=(a+b)/2,fm=ev(m),whole=(b-a)*(fa+4*fm+fb)/6;
  function rec(l,r,fl,fm0,fr,S,depth,tol){
    var mid=(l+r)/2,lm=(l+mid)/2,rm=(mid+r)/2,flm=ev(lm),frm=ev(rm),
      left=(mid-l)*(fl+4*flm+fm0)/6,right=(r-mid)*(fm0+4*frm+fr)/6,delta=left+right-S;
    if(depth<=0||Math.abs(delta)<=15*tol)return {value:left+right+delta/15,error:Math.abs(delta/15)};
    var L=rec(l,mid,fl,flm,fm0,left,depth-1,tol/2),R=rec(mid,r,fm0,frm,fr,right,depth-1,tol/2);
    return {value:L.value+R.value,error:L.error+R.error};
  }
  var tol=Math.max(absTol,relTol*Math.abs(whole)),res=rec(a,b,fa,fm,fb,whole,maxDepth,tol);
  return {value:sign*res.value,errorEstimate:res.error,evaluations:evaluations};
}
function integrateAstNumeric(ast,variable,a,b,baseEnv,options){
  return adaptiveSimpsonFn(function(x){var env=Object.assign({},baseEnv||{});env[variable]=x;return evalAst(ast,env);},a,b,options);
}
function doubleIntegralNumeric(expr,var1,a,b,var2,c,d,baseEnv,options){
  var evaluations=0,error=0,res=adaptiveSimpsonFn(function(x){
    var env=Object.assign({},baseEnv||{});env[var1]=x;
    var inner=integrateAstNumeric(asExpr(expr).ast,var2,c,d,env,options);evaluations+=inner.evaluations;error+=inner.errorEstimate;return inner.value;
  },a,b,options);evaluations+=res.evaluations;return {value:res.value,errorEstimate:res.errorEstimate+error,evaluations:evaluations};
}
function tripleIntegralNumeric(expr,v1,a,b,v2,c,d,v3,e,f,baseEnv,options){
  var evaluations=0,error=0,res=adaptiveSimpsonFn(function(x){
    var env=Object.assign({},baseEnv||{});env[v1]=x;
    var inner=doubleIntegralNumeric(expr,v2,c,d,v3,e,f,env,options);evaluations+=inner.evaluations;error+=inner.errorEstimate;return inner.value;
  },a,b,options);evaluations+=res.evaluations;return {value:res.value,errorEstimate:res.errorEstimate+error,evaluations:evaluations};
}
function definiteMaybeSymbolic(expr,variable,aSource,bSource,options){
  try{
    if(asExpr(expr).variables().every(function(v){return v===variable;}))return C.definiteIntegral(expr,variable,aSource,bSource,options);
  }catch(e){}
  var a=parseNumber(aSource),b=parseNumber(bSource),n=integrateAstNumeric(asExpr(expr).ast,variable,a,b,{},options);
  return {value:n.value,exact:false,method:"adaptive-simpson-u2",errorEstimate:n.errorEstimate,evaluations:n.evaluations,toString:function(){return "≈ "+M.formatNumber(n.value,12);}};
}

/* Curves and line integrals --------------------------------------------- */
function parametricCurve(componentSources,parameter){
  var r=componentSources.map(asExpr),dr=r.map(function(e){return derivativeExpr(e,parameter);});
  return {components:r,derivatives:dr,parameter:parameter};
}
function lineIntegralVector(field,curve,aSource,bSource,options){
  if(field.components.length!==curve.components.length)throw new MultivariableError("SHAPE_ERROR","Field and curve dimensions differ");
  var map={};field.variables.forEach(function(v,i){map[v]=curve.components[i];});
  var along=field.components.map(function(c){return substituteExpr(c,map);}),integrand=new A.SymbolicExpression(simplify(dotAst(along,curve.derivatives)));
  var result=definiteMaybeSymbolic(integrand,curve.parameter,aSource,bSource,options);
  return {integrand:integrand,result:result,toString:function(){return result.toString();}};
}
function arcLength(curve,aSource,bSource,options){
  var speed=new A.SymbolicExpression(simplify(normAst(curve.derivatives))),result=definiteMaybeSymbolic(speed,curve.parameter,aSource,bSource,options);
  return {speed:speed,result:result,toString:function(){return result.toString();}};
}
function scalarLineIntegral(source,variables,curve,aSource,bSource,options){
  if(variables.length!==curve.components.length)throw new MultivariableError("SHAPE_ERROR","Scalar field dimension and curve dimensions differ");
  var map={};variables.forEach(function(v,i){map[v]=curve.components[i];});
  var along=substituteExpr(source,map),speed=new A.SymbolicExpression(simplify(normAst(curve.derivatives))),integrand=new A.SymbolicExpression(simplify(bin("*",cloneAst(along.ast),cloneAst(speed.ast)))),result=definiteMaybeSymbolic(integrand,curve.parameter,aSource,bSource,options);
  return {integrand:integrand,result:result,toString:function(){return result.toString();}};
}

/* Surfaces --------------------------------------------------------------- */
function parametricSurface(componentSources,u,v){
  if(componentSources.length!==3)throw new MultivariableError("SHAPE_ERROR","Parametric surfaces require three coordinate components");
  var r=componentSources.map(asExpr),ru=r.map(function(e){return derivativeExpr(e,u);}),rv=r.map(function(e){return derivativeExpr(e,v);}),normal=crossAst(ru,rv);
  return {components:r,u:u,v:v,ru:ru,rv:rv,normal:normal};
}
function surfaceArea(surface,u0,u1,v0,v1,options){
  var density=new A.SymbolicExpression(simplify(normAst(surface.normal))),res=doubleIntegralNumeric(density,surface.u,parseNumber(u0),parseNumber(u1),surface.v,parseNumber(v0),parseNumber(v1),{},options);
  return {density:density,result:res,toString:function(){return "≈ "+M.formatNumber(res.value,12);}};
}
function surfaceFlux(field,surface,u0,u1,v0,v1,options){
  var map={};field.variables.forEach(function(x,i){map[x]=surface.components[i];});
  var along=field.components.map(function(c){return substituteExpr(c,map);}),density=new A.SymbolicExpression(simplify(dotAst(along,surface.normal))),
    res=doubleIntegralNumeric(density,surface.u,parseNumber(u0),parseNumber(u1),surface.v,parseNumber(v0),parseNumber(v1),{},options);
  return {density:density,result:res,toString:function(){return "≈ "+M.formatNumber(res.value,12);}};
}

/* Integral theorem verification on rectangular domains ------------------ */
function rectangleBoundary(field,x,y,x0,x1,y0,y1,options,zConst){
  var t="__t",sum=0,error=0,evals=0,paths=[
    [String(x0)+"+("+String(x1)+"-"+String(x0)+")*"+t,String(y0)],
    [String(x1),String(y0)+"+("+String(y1)+"-"+String(y0)+")*"+t],
    [String(x1)+"-("+String(x1)+"-"+String(x0)+")*"+t,String(y1)],
    [String(x0),String(y1)+"-("+String(y1)+"-"+String(y0)+")*"+t]
  ];
  paths.forEach(function(p){
    if(field.components.length===3)p.push(String(zConst===undefined?0:zConst));
    var r=lineIntegralVector(field,parametricCurve(p,t),"0","1",options).result;
    sum+=M.toNumber(r.value);error+=r.errorEstimate||0;evals+=r.evaluations||0;
  });
  return {value:sum,errorEstimate:error,evaluations:evals};
}
function greenTheorem(P,Q,x,y,x0,x1,y0,y1,options){
  var field=new VectorField([P,Q],[x,y]),curl=field.curl(),lhs=rectangleBoundary(field,x,y,x0,x1,y0,y1,options),
    rhs=doubleIntegralNumeric(curl,x,parseNumber(x0),parseNumber(x1),y,parseNumber(y0),parseNumber(y1),{},options),residual=Math.abs(lhs.value-rhs.value);
  return {boundary:lhs,interior:rhs,curl:curl,residual:residual,toString:function(){return "boundary ≈ "+M.formatNumber(lhs.value,10)+"; ∬curl ≈ "+M.formatNumber(rhs.value,10)+"; residual "+M.formatNumber(residual,4);}};
}
function stokesPlane(field,x0,x1,y0,y1,z0,options){
  if(field.components.length!==3)throw new MultivariableError("SHAPE_ERROR","Stokes verification requires a 3D field");
  var x=field.variables[0],y=field.variables[1],z=field.variables[2],curl=field.curl(),curlZ=substituteExpr(curl[2],{[z]:z0}),
    boundary=rectangleBoundary(field,x,y,x0,x1,y0,y1,options,z0),
    surface=doubleIntegralNumeric(curlZ,x,parseNumber(x0),parseNumber(x1),y,parseNumber(y0),parseNumber(y1),{},options),
    residual=Math.abs(boundary.value-surface.value);
  return {boundary:boundary,surface:surface,curl:curl,residual:residual,toString:function(){return "∮F·dr ≈ "+M.formatNumber(boundary.value,10)+"; ∬curl·n ≈ "+M.formatNumber(surface.value,10)+"; residual "+M.formatNumber(residual,4);}};
}
function boxFlux(field,bounds,options){
  var vars=field.variables,sum=0,error=0,evals=0;
  function face(component,index,fixed,sign,aVar,a0,a1,bVar,b0,b1){
    var expr=substituteExpr(component,{[vars[index]]:fixed}),res=doubleIntegralNumeric(expr,aVar,parseNumber(a0),parseNumber(a1),bVar,parseNumber(b0),parseNumber(b1),{},options);
    sum+=sign*res.value;error+=res.errorEstimate;evals+=res.evaluations;
  }
  face(field.components[0],0,bounds[0][1],1,vars[1],bounds[1][0],bounds[1][1],vars[2],bounds[2][0],bounds[2][1]);
  face(field.components[0],0,bounds[0][0],-1,vars[1],bounds[1][0],bounds[1][1],vars[2],bounds[2][0],bounds[2][1]);
  face(field.components[1],1,bounds[1][1],1,vars[0],bounds[0][0],bounds[0][1],vars[2],bounds[2][0],bounds[2][1]);
  face(field.components[1],1,bounds[1][0],-1,vars[0],bounds[0][0],bounds[0][1],vars[2],bounds[2][0],bounds[2][1]);
  face(field.components[2],2,bounds[2][1],1,vars[0],bounds[0][0],bounds[0][1],vars[1],bounds[1][0],bounds[1][1]);
  face(field.components[2],2,bounds[2][0],-1,vars[0],bounds[0][0],bounds[0][1],vars[1],bounds[1][0],bounds[1][1]);
  return {value:sum,errorEstimate:error,evaluations:evals};
}
function divergenceTheorem(field,bounds,options){
  if(field.components.length!==3)throw new MultivariableError("SHAPE_ERROR","Divergence theorem verification requires a 3D field");
  var v=field.variables,div=field.divergence(),volume=tripleIntegralNumeric(div,v[0],parseNumber(bounds[0][0]),parseNumber(bounds[0][1]),v[1],parseNumber(bounds[1][0]),parseNumber(bounds[1][1]),v[2],parseNumber(bounds[2][0]),parseNumber(bounds[2][1]),{},options),
    flux=boxFlux(field,bounds,options),residual=Math.abs(volume.value-flux.value);
  return {divergence:div,volume:volume,flux:flux,residual:residual,toString:function(){return "∭div F ≈ "+M.formatNumber(volume.value,10)+"; ∬F·n ≈ "+M.formatNumber(flux.value,10)+"; residual "+M.formatNumber(residual,4);}};
}

/* Command router --------------------------------------------------------- */
function parseSemicolon(raw,name){
  var body=parseCall(raw,name);return body===null?null:splitTopLevel(body,";");
}
function runCommand(raw,options){
  raw=String(raw).trim();options=options||{};

  var parts=parseSemicolon(raw,"totaldiff");
  if(parts){
    if(parts.length!==2)throw new MultivariableError("ARITY_ERROR","totaldiff expects totaldiff(expression; x,y,...)");
    var td=totalDifferential(parts[0],parseVarList(parts[1]));
    return commandResult(td.toString(),"total-differential",{value:td,metadata:{operation:"totaldiff"}});
  }

  parts=parseSemicolon(raw,"directional");
  if(parts){
    if(parts.length!==4)throw new MultivariableError("ARITY_ERROR","directional expects directional(expression; x,y,...; point; direction)");
    var vars=parseVarList(parts[1]),point=splitArgs(parts[2]),dir=splitArgs(parts[3]),dd=directionalDerivative(parts[0],vars,point,dir);
    return commandResult(dd.toString(),"directional-derivative",{value:dd.expression,metadata:{operation:"directional",variables:vars}});
  }

  parts=parseSemicolon(raw,"implicitdiff");
  if(parts){
    if(parts.length!==3)throw new MultivariableError("ARITY_ERROR","implicitdiff expects implicitdiff(F; dependent; independent)");
    var imp=implicitDerivative(parts[0],parts[1],parts[2]);
    return commandResult(imp.toString(),"implicit-derivative",{value:imp.expression,metadata:{operation:"implicitdiff"}});
  }

  parts=parseSemicolon(raw,"tangentplane");
  if(parts){
    if(parts.length<3||parts.length>4)throw new MultivariableError("ARITY_ERROR","tangentplane expects tangentplane(f; x,y; x0,y0; zName?)");
    var tv=parseVarList(parts[1]),tp=tangentPlane(parts[0],tv,splitArgs(parts[2]),parts[3]||"z");
    return commandResult(tp.toString(),"tangent-plane",{value:tp.expression,metadata:{operation:"tangentplane",variables:tv}});
  }

  parts=parseSemicolon(raw,"mtaylor");
  if(parts){
    if(parts.length!==4)throw new MultivariableError("ARITY_ERROR","mtaylor expects mtaylor(f; x,y,...; center; order)");
    var mv=parseVarList(parts[1]),mt=multiTaylor(parts[0],mv,splitArgs(parts[2]),Number(parts[3]));
    return commandResult(mt.toString(),"multivariable-taylor",{value:mt.expression,metadata:{operation:"mtaylor",variables:mv,order:mt.order}});
  }

  parts=parseSemicolon(raw,"mlimit");
  if(parts){
    if(parts.length!==3)throw new MultivariableError("ARITY_ERROR","mlimit expects mlimit(f; x,y,...; point)");
    var lv=parseVarList(parts[1]),lim=multivariableLimit(parts[0],lv,splitArgs(parts[2]));
    return commandResult(lim.toString(),"multivariable-limit",{value:lim.value,metadata:{operation:"mlimit",method:lim.method,variables:lv}});
  }

  parts=parseSemicolon(raw,"critical");
  if(parts){
    if(parts.length!==2)throw new MultivariableError("ARITY_ERROR","critical expects critical(f; x,y)");
    var cv=parseVarList(parts[1]),cp=criticalPoints(parts[0],cv);
    return commandResult(cp.toString(),"critical-points",{value:cp.solution,metadata:{operation:"critical",variables:cv}});
  }

  parts=parseSemicolon(raw,"classify");
  if(parts){
    if(parts.length!==3)throw new MultivariableError("ARITY_ERROR","classify expects classify(f; x,y; x0,y0)");
    var clv=parseVarList(parts[1]),cl=classifyCriticalPoint(parts[0],clv,splitArgs(parts[2]));
    return commandResult(cl.toString(),"critical-classification",{value:cl,metadata:{operation:"classify",classification:cl.classification}});
  }

  parts=parseSemicolon(raw,"lagrange");
  if(parts){
    if(parts.length!==5)throw new MultivariableError("ARITY_ERROR","lagrange expects lagrange(f; g; target; x,y)");
    var lvars=parseVarList(parts[4]),lg=lagrangeLinearConstraint(parts[0],parts[1],parts[2],lvars);
    return commandResult(lg.toString(),"lagrange",{value:lg.solution,metadata:{operation:"lagrange",variables:lvars}});
  }

  parts=parseSemicolon(raw,"div");
  if(parts){
    if(parts.length!==2)throw new MultivariableError("ARITY_ERROR","div expects div(Fx,Fy[,Fz]; x,y[,z])");
    var df=new VectorField(splitArgs(parts[0]),parseVarList(parts[1])),dv=df.divergence();
    return commandResult(dv.toString(),"divergence",{value:dv,metadata:{operation:"div"}});
  }

  parts=parseSemicolon(raw,"curl");
  if(parts){
    if(parts.length!==2)throw new MultivariableError("ARITY_ERROR","curl expects curl(Fx,Fy[,Fz]; x,y[,z])");
    var cf=new VectorField(splitArgs(parts[0]),parseVarList(parts[1])),cu=cf.curl(),cdisp=Array.isArray(cu)?formatVector(cu):cu.toString();
    return commandResult(cdisp,"curl",{value:cu,metadata:{operation:"curl"}});
  }

  parts=parseSemicolon(raw,"potential");
  if(parts){
    if(parts.length!==2)throw new MultivariableError("ARITY_ERROR","potential expects potential(F components; variables)");
    var pf=new VectorField(splitArgs(parts[0]),parseVarList(parts[1])),pot=potential(pf);
    return commandResult(pot.toString()+" + C","potential",{value:pot,metadata:{operation:"potential"}});
  }

  parts=parseSemicolon(raw,"conservative");
  if(parts){
    if(parts.length!==2)throw new MultivariableError("ARITY_ERROR","conservative expects conservative(F components; variables)");
    var cof=new VectorField(splitArgs(parts[0]),parseVarList(parts[1])),co=conservative(cof);
    return commandResult(co.toString(),"conservative-test",{value:co,metadata:{operation:"conservative",conservative:co.conservative}});
  }

  parts=parseSemicolon(raw,"lineint");
  if(parts){
    if(parts.length!==5)throw new MultivariableError("ARITY_ERROR","lineint expects lineint(F components; variables; curve components; parameter; a,b)");
    var lf=new VectorField(splitArgs(parts[0]),parseVarList(parts[1])),curve=parametricCurve(splitArgs(parts[2]),parts[3]),bounds=splitArgs(parts[4]);
    if(bounds.length!==2)throw new MultivariableError("ARITY_ERROR","Line-integral bounds require a,b");
    var li=lineIntegralVector(lf,curve,bounds[0],bounds[1],options);
    return commandResult(li.toString(),"line-integral",{value:li.result.value,exact:!!li.result.exact,symbolic:false,metadata:{operation:"lineint",integrand:li.integrand.toString(),method:li.result.method}});
  }

  parts=parseSemicolon(raw,"arclength");
  if(parts){
    if(parts.length!==3)throw new MultivariableError("ARITY_ERROR","arclength expects arclength(curve components; parameter; a,b)");
    var ac=parametricCurve(splitArgs(parts[0]),parts[1]),ab=splitArgs(parts[2]);if(ab.length!==2)throw new MultivariableError("ARITY_ERROR","Arc-length bounds require a,b");
    var al=arcLength(ac,ab[0],ab[1],options);
    return commandResult(al.toString(),"arc-length",{value:al.result.value,exact:!!al.result.exact,symbolic:false,metadata:{operation:"arclength",speed:al.speed.toString(),method:al.result.method}});
  }

  parts=parseSemicolon(raw,"scalarline");
  if(parts){
    if(parts.length!==6)throw new MultivariableError("ARITY_ERROR","scalarline expects scalarline(f; variables; curve; parameter; a,b)");
    var slv=parseVarList(parts[1]),slc=parametricCurve(splitArgs(parts[2]),parts[3]),slb=splitArgs(parts[4]);
    if(slb.length!==2)throw new MultivariableError("ARITY_ERROR","Scalar line-integral bounds require a,b");
    var sl=scalarLineIntegral(parts[0],slv,slc,slb[0],slb[1],options);
    return commandResult(sl.toString(),"scalar-line-integral",{value:sl.result.value,exact:!!sl.result.exact,symbolic:false,metadata:{operation:"scalarline",integrand:sl.integrand.toString(),method:sl.result.method}});
  }

  parts=parseSemicolon(raw,"doubleint");
  if(parts){
    if(parts.length!==5)throw new MultivariableError("ARITY_ERROR","doubleint expects doubleint(f; x; a,b; y; c,d)");
    var b1=splitArgs(parts[2]),b2=splitArgs(parts[4]);if(b1.length!==2||b2.length!==2)throw new MultivariableError("ARITY_ERROR","Double-integral bounds must be pairs");
    var di=doubleIntegralNumeric(parts[0],parts[1],parseNumber(b1[0]),parseNumber(b1[1]),parts[3],parseNumber(b2[0]),parseNumber(b2[1]),{},options);
    return commandResult("≈ "+M.formatNumber(di.value,12),"double-integral",{value:di.value,exact:false,symbolic:false,metadata:{operation:"doubleint",errorEstimate:di.errorEstimate,evaluations:di.evaluations}});
  }

  parts=parseSemicolon(raw,"tripleint");
  if(parts){
    if(parts.length!==7)throw new MultivariableError("ARITY_ERROR","tripleint expects tripleint(f; x; a,b; y; c,d; z; e,f)");
    var tb1=splitArgs(parts[2]),tb2=splitArgs(parts[4]),tb3=splitArgs(parts[6]);if(tb1.length!==2||tb2.length!==2||tb3.length!==2)throw new MultivariableError("ARITY_ERROR","Triple-integral bounds must be pairs");
    var tri=tripleIntegralNumeric(parts[0],parts[1],parseNumber(tb1[0]),parseNumber(tb1[1]),parts[3],parseNumber(tb2[0]),parseNumber(tb2[1]),parts[5],parseNumber(tb3[0]),parseNumber(tb3[1]),{},options);
    return commandResult("≈ "+M.formatNumber(tri.value,12),"triple-integral",{value:tri.value,exact:false,symbolic:false,metadata:{operation:"tripleint",errorEstimate:tri.errorEstimate,evaluations:tri.evaluations}});
  }

  parts=parseSemicolon(raw,"surfacearea");
  if(parts){
    if(parts.length!==5)throw new MultivariableError("ARITY_ERROR","surfacearea expects surfacearea(rx,ry,rz; u,v; u0,u1; v0,v1)");
    var uv=parseVarList(parts[1]),ub=splitArgs(parts[2]),vb=splitArgs(parts[3]);
    if(uv.length!==2||ub.length!==2||vb.length!==2)throw new MultivariableError("SHAPE_ERROR","Surface area needs u,v and two bound pairs");
    var sa=surfaceArea(parametricSurface(splitArgs(parts[0]),uv[0],uv[1]),ub[0],ub[1],vb[0],vb[1],options);
    return commandResult(sa.toString(),"surface-area",{value:sa.result.value,exact:false,symbolic:false,metadata:{operation:"surfacearea",density:sa.density.toString(),errorEstimate:sa.result.errorEstimate}});
  }

  parts=parseSemicolon(raw,"flux");
  if(parts){
    if(parts.length!==7)throw new MultivariableError("ARITY_ERROR","flux expects flux(Fx,Fy,Fz; x,y,z; rx,ry,rz; u,v; u0,u1; v0,v1)");
    var fvars=parseVarList(parts[1]),svars=parseVarList(parts[3]),fb1=splitArgs(parts[4]),fb2=splitArgs(parts[5]);
    if(fvars.length!==3||svars.length!==2||fb1.length!==2||fb2.length!==2)throw new MultivariableError("SHAPE_ERROR","Flux needs a 3D field, u,v, and two bound pairs");
    var sf=new VectorField(splitArgs(parts[0]),fvars),surf=parametricSurface(splitArgs(parts[2]),svars[0],svars[1]),fl=surfaceFlux(sf,surf,fb1[0],fb1[1],fb2[0],fb2[1],options);
    return commandResult(fl.toString(),"surface-flux",{value:fl.result.value,exact:false,symbolic:false,metadata:{operation:"flux",density:fl.density.toString(),errorEstimate:fl.result.errorEstimate}});
  }

  parts=parseSemicolon(raw,"green");
  if(parts){
    if(parts.length!==5)throw new MultivariableError("ARITY_ERROR","green expects green(P,Q; x,y; x0,x1; y0,y1)");
    var gv=parseVarList(parts[1]),gb1=splitArgs(parts[2]),gb2=splitArgs(parts[3]);
    if(gv.length!==2||gb1.length!==2||gb2.length!==2)throw new MultivariableError("SHAPE_ERROR","Green verification requires x,y and two bound pairs");
    var gc=splitArgs(parts[0]);if(gc.length!==2)throw new MultivariableError("SHAPE_ERROR","Green verification requires P,Q");
    var gr=greenTheorem(gc[0],gc[1],gv[0],gv[1],gb1[0],gb1[1],gb2[0],gb2[1],options);
    return commandResult(gr.toString(),"green-theorem",{value:gr,exact:false,symbolic:false,metadata:{operation:"green",residual:gr.residual}});
  }

  parts=parseSemicolon(raw,"stokes");
  if(parts){
    if(parts.length!==6)throw new MultivariableError("ARITY_ERROR","stokes expects stokes(Fx,Fy,Fz; x,y,z; x0,x1; y0,y1; z0)");
    var stv=parseVarList(parts[1]),stx=splitArgs(parts[2]),sty=splitArgs(parts[3]);if(stv.length!==3||stx.length!==2||sty.length!==2)throw new MultivariableError("SHAPE_ERROR","Stokes rectangle requires a 3D field and x/y bound pairs");
    var st=stokesPlane(new VectorField(splitArgs(parts[0]),stv),stx[0],stx[1],sty[0],sty[1],parts[4],options);
    return commandResult(st.toString(),"stokes-theorem",{value:st,exact:false,symbolic:false,metadata:{operation:"stokes",residual:st.residual}});
  }

  parts=parseSemicolon(raw,"gauss");
  if(parts){
    if(parts.length!==6)throw new MultivariableError("ARITY_ERROR","gauss expects gauss(Fx,Fy,Fz; x,y,z; x0,x1; y0,y1; z0,z1)");
    var gav=parseVarList(parts[1]),bx=splitArgs(parts[2]),by=splitArgs(parts[3]),bz=splitArgs(parts[4]);
    if(gav.length!==3||bx.length!==2||by.length!==2||bz.length!==2)throw new MultivariableError("SHAPE_ERROR","Gauss verification requires a 3D field and three bound pairs");
    var ga=divergenceTheorem(new VectorField(splitArgs(parts[0]),gav),[bx,by,bz],options);
    return commandResult(ga.toString(),"divergence-theorem",{value:ga,exact:false,symbolic:false,metadata:{operation:"gauss",residual:ga.residual}});
  }

  if(/^mvhelp\s*\(\s*\)$/i.test(raw)){
    return commandResult("U2: totaldiff · directional · implicitdiff · tangentplane · mtaylor · mlimit · critical · classify · lagrange · div · curl · potential · conservative · lineint · arclength · doubleint · tripleint · surfacearea · flux · green · stokes · gauss","multivariable-help",{metadata:{operation:"mvhelp"}});
  }
  return null;
}

global.CalcMultivariable={
  VERSION:"2.1.0-u2",
  MultivariableError:MultivariableError,UnsupportedMultivariableError:UnsupportedMultivariableError,MultivariableLimitError:MultivariableLimitError,
  VectorField:VectorField,
  totalDifferential:totalDifferential,directionalDerivative:directionalDerivative,implicitDerivative:implicitDerivative,tangentPlane:tangentPlane,multiTaylor:multiTaylor,multivariableLimit:multivariableLimit,
  criticalPoints:criticalPoints,classifyCriticalPoint:classifyCriticalPoint,lagrangeLinearConstraint:lagrangeLinearConstraint,
  potential:potential,conservative:conservative,
  adaptiveSimpsonFn:adaptiveSimpsonFn,integrateAstNumeric:integrateAstNumeric,doubleIntegralNumeric:doubleIntegralNumeric,tripleIntegralNumeric:tripleIntegralNumeric,
  parametricCurve:parametricCurve,lineIntegralVector:lineIntegralVector,arcLength:arcLength,scalarLineIntegral:scalarLineIntegral,
  parametricSurface:parametricSurface,surfaceArea:surfaceArea,surfaceFlux:surfaceFlux,
  greenTheorem:greenTheorem,stokesPlane:stokesPlane,divergenceTheorem:divergenceTheorem,
  runCommand:runCommand
};
})(window);
