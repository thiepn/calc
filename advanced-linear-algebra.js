(function(global){
"use strict";

const M=global.CalcMath;
const A=global.CalcAlgebra;
const LA=global.CalcLinearAlgebra;
if(!M||!A||!LA)throw new Error("CalcMath, CalcAlgebra, and CalcLinearAlgebra must load before CalcAdvancedLinearAlgebra");

class AdvancedLinearAlgebraError extends M.CalcError{
  constructor(code,message,details){super(code||"ADVANCED_LINEAR_ALGEBRA_ERROR",message,undefined,undefined,details);}
}
class UnsupportedAdvancedLinearAlgebraError extends AdvancedLinearAlgebraError{
  constructor(message,details){super("UNSUPPORTED_ADVANCED_LINEAR_ALGEBRA",message,details);}
}
class SchurConvergenceError extends AdvancedLinearAlgebraError{
  constructor(message,details){super("SCHUR_CONVERGENCE",message||"Real Schur iteration did not converge",details);}
}

function rat(n,d){return new M.Rational(BigInt(n),d===undefined?1n:BigInt(d));}
function commandResult(display,kind,details){
  details=details||{};
  return {
    value:details.value===undefined?null:details.value,
    display:String(display),approx:details.approx||"",
    exact:details.exact===undefined?true:!!details.exact,
    kind:kind||"advanced-linear-algebra",
    symbolic:details.symbolic===undefined?false:!!details.symbolic,
    metadata:Object.assign({numericKind:kind||"advanced-linear-algebra",exact:details.exact===undefined?true:!!details.exact,u5:true},details.metadata||{})
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
function parseSemicolon(raw,name){var body=parseCall(raw,name);return body===null?null:splitTopLevel(body,";");}
function parseMatrix(source){
  var rows=splitTopLevel(source,"|").map(function(row){return splitArgs(row);});
  if(!rows.length||!rows[0].length)throw new AdvancedLinearAlgebraError("MATRIX_REQUIRED","Matrix input is empty");
  if(rows.some(function(r){return r.length!==rows[0].length;}))throw new AdvancedLinearAlgebraError("MATRIX_SHAPE_ERROR","Matrix rows must have equal length");
  try{return LA.Matrix.fromStrings(rows,{}, {symbolic:false,angle:"RAD"});}
  catch(e){throw new AdvancedLinearAlgebraError("MATRIX_PARSE_ERROR","Could not parse matrix: "+e.message,{cause:e.code||e.message});}
}
function parseVector(source){
  var cells=splitArgs(source);
  if(!cells.length)throw new AdvancedLinearAlgebraError("VECTOR_REQUIRED","Vector input is empty");
  return new LA.Vector(cells.map(function(cell){
    try{return M.evaluate(String(cell),{}, {commit:false,complex:true,angle:"RAD"}).value;}
    catch(e){throw new AdvancedLinearAlgebraError("VECTOR_PARSE_ERROR","Could not parse vector entry '"+cell+"'",{cause:e.code||e.message});}
  }));
}
function realNumber(v){
  if(v instanceof A.SymbolicExpression)throw new UnsupportedAdvancedLinearAlgebraError("Numerical advanced linear algebra does not accept symbolic matrix entries");
  if(v instanceof M.Complex&&!M.isZero(v.im))throw new UnsupportedAdvancedLinearAlgebraError("This U5 operation currently requires a real matrix");
  var n=M.toNumber(v);if(!Number.isFinite(n))throw new UnsupportedAdvancedLinearAlgebraError("Matrix entries must be finite real numbers");return n;
}
function numericRows(A){return A.data.map(function(r){return r.map(realNumber);});}
function numericMatrix(rows){return new LA.Matrix(rows.map(function(r){return r.map(Number);}));}
function eye(n){return Array.from({length:n},function(_,i){return Array.from({length:n},function(_,j){return i===j?1:0;});});}
function transpose(A){return Array.from({length:A[0].length},function(_,j){return A.map(function(r){return r[j];});});}
function mul(A,B){
  var R=Array.from({length:A.length},function(){return Array(B[0].length).fill(0);});
  for(var i=0;i<A.length;i++)for(var k=0;k<B.length;k++)for(var j=0;j<B[0].length;j++)R[i][j]+=A[i][k]*B[k][j];
  return R;
}
function sub(A,B){return A.map(function(r,i){return r.map(function(x,j){return x-B[i][j];});});}
function add(A,B){return A.map(function(r,i){return r.map(function(x,j){return x+B[i][j];});});}
function scale(A,c){return A.map(function(r){return r.map(function(x){return x*c;});});}
function fro(A){return Math.sqrt(A.reduce(function(s,r){return s+r.reduce(function(q,x){return q+x*x;},0);},0));}
function vecNorm(v){return Math.sqrt(v.reduce(function(s,x){return s+x*x;},0));}
function offDiagBelowFirst(A){var s=0;for(var i=0;i<A.length;i++)for(var j=0;j<i-1;j++)s+=A[i][j]*A[i][j];return Math.sqrt(s);}
function matResidual(A,B){return fro(sub(A,B));}
function matrixToString(A,p){return (A instanceof LA.Matrix?A:numericMatrix(A)).toString(p||10);}
function tinyZero(X,tol){
  var n=X.length;
  for(var i=0;i<n;i++)for(var j=0;j<n;j++)if(Math.abs(X[i][j])<tol)X[i][j]=0;
  return X;
}
function quasiUpperTriangular(T,tol){
  var n=T.length;
  for(var i=0;i<n;i++)for(var j=0;j<i-1;j++)if(Math.abs(T[i][j])>tol)return false;
  for(var i=1;i<n-1;i++)if(Math.abs(T[i][i-1])>tol&&Math.abs(T[i+1][i])>tol)return false;
  return true;
}

/* Hessenberg + real Schur ----------------------------------------------- */
function hessenberg(A){
  var H=A.map(function(r){return r.slice();}),n=H.length,Q=eye(n);
  for(var k=0;k<n-2;k++){
    var x=[];for(var i=k+1;i<n;i++)x.push(H[i][k]);
    var nx=vecNorm(x);if(nx<=1e-15)continue;
    var sign=x[0]>=0?1:-1,v=x.slice();v[0]+=sign*nx;
    var nv=vecNorm(v);if(nv<=1e-15)continue;v=v.map(function(z){return z/nv;});
    for(var j=k;j<n;j++){
      var d=0;for(var ii=k+1;ii<n;ii++)d+=v[ii-k-1]*H[ii][j];
      for(var ii=k+1;ii<n;ii++)H[ii][j]-=2*v[ii-k-1]*d;
    }
    for(var i=0;i<n;i++){
      var d=0;for(var jj=k+1;jj<n;jj++)d+=H[i][jj]*v[jj-k-1];
      for(var jj=k+1;jj<n;jj++)H[i][jj]-=2*d*v[jj-k-1];
    }
    for(var i=0;i<n;i++){
      var d=0;for(var jj=k+1;jj<n;jj++)d+=Q[i][jj]*v[jj-k-1];
      for(var jj=k+1;jj<n;jj++)Q[i][jj]-=2*d*v[jj-k-1];
    }
  }
  return {H:tinyZero(H,1e-14),Q:Q};
}
function qrNumeric(X){
  var d=LA.qrDecomposition(numericMatrix(X)),Q=numericRows(d.Q),R=numericRows(d.R);
  return {Q:Q,R:R};
}
function trailingShift(T){
  var n=T.length;if(n===1)return T[0][0];
  var a=T[n-2][n-2],b=T[n-2][n-1],c=T[n-1][n-2],d=T[n-1][n-1],
    tr=a+d,disc=tr*tr-4*(a*d-b*c);
  if(disc>=0){
    var r=Math.sqrt(disc),l1=(tr+r)/2,l2=(tr-r)/2;
    return Math.abs(l1-d)<Math.abs(l2-d)?l1:l2;
  }
  return tr/2;
}
function realSchur(A,options){
  if(!(A instanceof LA.Matrix))A=new LA.Matrix(A);
  if(!A.isSquare())throw new AdvancedLinearAlgebraError("MATRIX_SHAPE_ERROR","Schur decomposition requires a square matrix");
  options=Object.assign({tol:1e-10,maxIterations:4000},options||{});
  var X=numericRows(A),n=A.rows;
  if(n===0)return {Q:new LA.Matrix([]),T:new LA.Matrix([]),residual:0,orthogonalityResidual:0,iterations:0,method:"real-shifted-qr-schur"};
  var hr=hessenberg(X),T=hr.H,Q=hr.Q,iter=0,scaleA=Math.max(1,fro(X));
  function clean(){
    for(var i=1;i<n;i++){
      var threshold=options.tol*Math.max(1,Math.abs(T[i-1][i-1]),Math.abs(T[i][i]));
      if(Math.abs(T[i][i-1])<=threshold)T[i][i-1]=0;
    }
    tinyZero(T,options.tol*1e-3);
  }
  clean();
  for(;iter<options.maxIterations&&!quasiUpperTriangular(T,options.tol*10);iter++){
    var mu=trailingShift(T),shifted=T.map(function(r,i){return r.map(function(x,j){return x-(i===j?mu:0);});}),qr=qrNumeric(shifted);
    T=mul(qr.R,qr.Q);for(var i=0;i<n;i++)T[i][i]+=mu;
    Q=mul(Q,qr.Q);clean();
  }
  if(!quasiUpperTriangular(T,options.tol*50))throw new SchurConvergenceError("Real Schur QR iteration did not reach a certified quasi-upper-triangular form",{iterations:iter,belowFirstSubdiagonal:offDiagBelowFirst(T)});
  var AQ=mul(X,Q),QT=mul(Q,T),res=fro(sub(AQ,QT))/scaleA,orth=fro(sub(mul(transpose(Q),Q),eye(n)));
  if(res>1e-7||orth>1e-7)throw new SchurConvergenceError("Real Schur reconstruction failed certification",{residual:res,orthogonalityResidual:orth,iterations:iter});
  return {Q:numericMatrix(Q),T:numericMatrix(T),residual:res,orthogonalityResidual:orth,iterations:iter,method:"real-shifted-qr-schur"};
}

/* Spectral theorem and matrix functions -------------------------------- */
function spectralDecomposition(A,options){
  if(!(A instanceof LA.Matrix))A=new LA.Matrix(A);
  if(!A.isSquare())throw new AdvancedLinearAlgebraError("MATRIX_SHAPE_ERROR","Spectral decomposition requires a square matrix");
  if(!LA.isSymmetric(A,options))throw new UnsupportedAdvancedLinearAlgebraError("U5 spectral decomposition is currently certified for real symmetric matrices");
  var d=LA.jacobiEigenSymmetric(numericMatrix(numericRows(A)),Object.assign({absTol:1e-12,relTol:1e-10,maxIterations:500},options||{})),
    Q=d.vectors,D=LA.Matrix.diagonal(d.values),AQ=numericRows(numericMatrix(numericRows(A)).multiply(Q)),QD=numericRows(Q.multiply(D)),
    orth=Q.transpose().multiply(Q).sub(LA.Matrix.identity(A.rows)).frobeniusNorm(),res=fro(sub(AQ,QD))/Math.max(1,A.frobeniusNorm()),
    projectors=[];
  for(var j=0;j<Q.cols;j++){var q=Q.col(j);projectors.push(q.outer(q));}
  if(res>1e-8||orth>1e-8)throw new AdvancedLinearAlgebraError("SPECTRAL_CERTIFICATE_FAILED","Spectral decomposition failed residual certification",{residual:res,orthogonalityResidual:orth});
  return {Q:Q,D:D,values:d.values.slice(),projectors:projectors,residual:res,orthogonalityResidual:orth,method:"real-symmetric-spectral-theorem"};
}
function matrixFunctionSymmetric(A,kind,param,options){
  var sd=spectralDecomposition(A,options),tol=1e-12,values=sd.values.map(function(l){
    if(kind==="exp")return Math.exp(l);
    if(kind==="sin")return Math.sin(l);
    if(kind==="cos")return Math.cos(l);
    if(kind==="abs")return Math.abs(l);
    if(kind==="sign")return l>tol?1:l<-tol?-1:0;
    if(kind==="sqrt"){if(l<-1e-10)throw new AdvancedLinearAlgebraError("MATRIX_FUNCTION_DOMAIN","Matrix square root through U5 spectral calculus requires positive semidefinite spectrum");return Math.sqrt(Math.max(0,l));}
    if(kind==="log"){if(!(l>tol))throw new AdvancedLinearAlgebraError("MATRIX_FUNCTION_DOMAIN","Matrix logarithm through U5 spectral calculus requires positive definite spectrum");return Math.log(l);}
    if(kind==="invsqrt"){if(!(l>tol))throw new AdvancedLinearAlgebraError("MATRIX_FUNCTION_DOMAIN","Inverse square root requires positive definite spectrum");return 1/Math.sqrt(l);}
    if(kind==="pow"){
      var p=Number(param);if(!Number.isFinite(p))throw new AdvancedLinearAlgebraError("INVALID_PARAMETER","matrixfunc pow requires a finite exponent");
      if(l<0&&Math.abs(p-Math.round(p))>1e-12)throw new AdvancedLinearAlgebraError("MATRIX_FUNCTION_DOMAIN","Fractional real powers of negative eigenvalues are not supported");
      return Math.pow(l,p);
    }
    throw new AdvancedLinearAlgebraError("INVALID_MATRIX_FUNCTION","Supported functions: exp, sin, cos, abs, sign, sqrt, log, invsqrt, pow");
  });
  var F=sd.Q.multiply(LA.Matrix.diagonal(values)).multiply(sd.Q.transpose()),sym=F.sub(F.transpose()).frobeniusNorm(),
    comm=A.multiply(F).sub(F.multiply(A)).frobeniusNorm()/Math.max(1,A.frobeniusNorm()*Math.max(1,F.frobeniusNorm())),verification={symmetryResidual:sym,commutatorResidual:comm};
  if(kind==="sqrt")verification.squareResidual=F.multiply(F).sub(A).frobeniusNorm()/Math.max(1,A.frobeniusNorm());
  if(kind==="invsqrt")verification.whiteningResidual=F.multiply(A).multiply(F).sub(LA.Matrix.identity(A.rows)).frobeniusNorm();
  if(sym>1e-8||comm>1e-8||(verification.squareResidual!==undefined&&verification.squareResidual>1e-7)||(verification.whiteningResidual!==undefined&&verification.whiteningResidual>1e-7))
    throw new AdvancedLinearAlgebraError("MATRIX_FUNCTION_CERTIFICATE_FAILED","Spectral matrix function failed reconstruction certification",{verification:verification});
  return {matrix:F,functionName:kind,parameter:param,eigenvalues:sd.values,mappedValues:values,spectral:sd,verification:verification,method:"spectral-functional-calculus"};
}

/* Jordan chains / Jordan V2 -------------------------------------------- */
function vectorRank(vectors){
  if(!vectors.length)return 0;
  return LA.rank(LA.Matrix.fromColumns(vectors));
}
function chainFromTop(N,top,length){
  var chain=Array(length),cur=top;chain[length-1]=cur;
  for(var i=length-2;i>=0;i--){cur=N.multiply(cur);chain[i]=cur;}
  return chain;
}
function jordanBlockSizes(nullities,m){
  var ge=Array(m+2).fill(0),sizes=[];
  for(var k=1;k<=m;k++)ge[k]=nullities[k]-nullities[k-1];
  ge[m+1]=0;
  for(var k=m;k>=1;k--){
    var count=ge[k]-ge[k+1];
    for(var c=0;c<count;c++)sizes.push(k);
  }
  return sizes;
}
function candidateVectors(basis){
  var out=basis.vectors.slice();
  for(var i=0;i<basis.vectors.length;i++)for(var j=i+1;j<basis.vectors.length;j++){
    out.push(basis.vectors[i].add(basis.vectors[j]));
    out.push(basis.vectors[i].sub(basis.vectors[j]));
  }
  return out;
}
function jordanFormV2(A,options){
  if(!(A instanceof LA.Matrix))A=new LA.Matrix(A);
  if(!A.isSquare()||!A.exact)throw new UnsupportedAdvancedLinearAlgebraError("Jordan V2 requires an exact square matrix");
  if(A.rows>6)throw new UnsupportedAdvancedLinearAlgebraError("Jordan V2 is currently capped at exact matrices of size 6");
  var analysis=LA.eigenAnalysis(A,{domain:"complex"}),totalAlg=analysis.eigenspaces.reduce(function(s,x){return s+x.algebraicMultiplicity;},0);
  if(totalAlg!==A.rows)throw new UnsupportedAdvancedLinearAlgebraError("Jordan V2 requires all eigenvalues to be certified by the exact eigenvalue solver",{certifiedMultiplicity:totalAlg,dimension:A.rows});
  var allChains=[],blocks=[],n=A.rows;
  for(var ei=0;ei<analysis.eigenspaces.length;ei++){
    var item=analysis.eigenspaces[ei],m=item.algebraicMultiplicity,N=A.sub(LA.Matrix.identity(n).scale(item.scalar)),nullities=[0],kernels=[null];
    for(var k=1;k<=m;k++){
      var Nk=N.power(k),K=LA.nullSpace(Nk);kernels[k]=K;nullities[k]=K.dimension();
    }
    if(nullities[m]!==m)throw new UnsupportedAdvancedLinearAlgebraError("Generalized eigenspace dimension did not reach algebraic multiplicity",{eigenvalue:item.value.toString(),nullities:nullities});
    var sizes=jordanBlockSizes(nullities,m),chosen=[];
    for(var si=0;si<sizes.length;si++){
      var len=sizes[si],candidates=candidateVectors(kernels[len]),found=null;
      for(var ci=0;ci<candidates.length;ci++){
        var ch=chainFromTop(N,candidates[ci],len);
        if(vectorRank(ch)!==len)continue;
        if(vectorRank(chosen.concat(ch))!==chosen.length+len)continue;
        found=ch;break;
      }
      if(!found)throw new UnsupportedAdvancedLinearAlgebraError("Could not construct an independent Jordan chain from the certified generalized eigenspaces",{eigenvalue:item.value.toString(),length:len});
      chosen=chosen.concat(found);
      allChains.push({eigenvalue:item.scalar,eigenvalueDisplay:item.value.toString(),length:len,vectors:found});
      blocks.push({eigenvalue:item.scalar,eigenvalueDisplay:item.value.toString(),size:len});
    }
  }
  var columns=[];allChains.forEach(function(ch){columns=columns.concat(ch.vectors);});
  if(columns.length!==n||vectorRank(columns)!==n)throw new UnsupportedAdvancedLinearAlgebraError("Constructed Jordan chains do not form a full basis",{vectors:columns.length,rank:vectorRank(columns),dimension:n});
  var P=LA.Matrix.fromColumns(columns),Jrows=Array.from({length:n},function(){return Array.from({length:n},function(){return rat(0);});}),offset=0;
  blocks.forEach(function(b){
    for(var i=0;i<b.size;i++){Jrows[offset+i][offset+i]=b.eigenvalue;if(i<b.size-1)Jrows[offset+i][offset+i+1]=rat(1);}
    offset+=b.size;
  });
  var J=new LA.Matrix(Jrows),res=A.multiply(P).sub(P.multiply(J)).frobeniusNorm();
  if(res>1e-9)throw new AdvancedLinearAlgebraError("JORDAN_CERTIFICATE_FAILED","Jordan V2 reconstruction failed AP=PJ",{residual:res});
  return {P:P,J:J,chains:allChains,blocks:blocks,residual:res,method:"exact-generalized-eigenvector-chains"};
}

/* Inner products, forms, inertia ---------------------------------------- */
function gramMatrix(A){
  if(!(A instanceof LA.Matrix))A=new LA.Matrix(A);
  return A.conjugateTranspose().multiply(A);
}
function orthonormalizeColumns(A,options){
  if(!(A instanceof LA.Matrix))A=new LA.Matrix(A);options=Object.assign({tol:1e-12},options||{});
  var Q=[];
  for(var j=0;j<A.cols;j++){
    var v=A.col(j);
    for(var i=0;i<Q.length;i++){var coeff=Q[i].dot(v);v=v.sub(Q[i].scale(coeff));}
    var nv=v.norm();if(nv<=options.tol)continue;Q.push(v.scale(1/nv));
  }
  var Qm=Q.length?LA.Matrix.fromColumns(Q):LA.Matrix.zeros(A.rows,0),R=Q.length?Qm.conjugateTranspose().multiply(A):LA.Matrix.zeros(0,A.cols),
    recon=Q.length?Qm.multiply(R):LA.Matrix.zeros(A.rows,A.cols),res=A.sub(recon).frobeniusNorm(),orth=Q.length?Qm.conjugateTranspose().multiply(Qm).sub(LA.Matrix.identity(Q.length)).frobeniusNorm():0;
  if(res>1e-8*Math.max(1,A.frobeniusNorm())||orth>1e-8)throw new AdvancedLinearAlgebraError("ORTHONORMALIZATION_CERTIFICATE_FAILED","Complex Gram-Schmidt failed certification",{residual:res,orthogonalityResidual:orth});
  return {Q:Qm,R:R,rank:Q.length,residual:res,orthogonalityResidual:orth,method:"complex-modified-gram-schmidt"};
}
function orthogonalProjector(A){
  var qr=orthonormalizeColumns(A),P=qr.rank?qr.Q.multiply(qr.Q.conjugateTranspose()):LA.Matrix.zeros(A.rows,A.rows),
    idem=P.multiply(P).sub(P).frobeniusNorm(),herm=P.conjugateTranspose().sub(P).frobeniusNorm();
  if(idem>1e-8||herm>1e-8)throw new AdvancedLinearAlgebraError("PROJECTOR_CERTIFICATE_FAILED","Orthogonal projector failed idempotence/Hermitian checks",{idempotenceResidual:idem,hermitianResidual:herm});
  return {P:P,rank:qr.rank,idempotenceResidual:idem,hermitianResidual:herm,Q:qr.Q,method:"orthonormal-column-space-projector"};
}
function realBilinear(A,u,v){
  if(!(A instanceof LA.Matrix))A=new LA.Matrix(A);if(!(u instanceof LA.Vector))u=new LA.Vector(u);if(!(v instanceof LA.Vector))v=new LA.Vector(v);
  if(A.rows!==u.length||A.cols!==v.length)throw new AdvancedLinearAlgebraError("MATRIX_SHAPE_ERROR","Bilinear-form dimensions do not match");
  var Av=A.multiply(v),sum=rat(0);
  for(var i=0;i<u.length;i++){
    if(u.values[i] instanceof M.Complex&&!M.isZero(u.values[i].im))throw new UnsupportedAdvancedLinearAlgebraError("bilinear(...) currently requires real vectors; use sesquilinear(...) for complex spaces");
    if(Av.values[i] instanceof M.Complex&&!M.isZero(Av.values[i].im))throw new UnsupportedAdvancedLinearAlgebraError("bilinear(...) currently requires a real matrix/vector result");
    sum=M.add(sum,M.mul(u.values[i],Av.values[i]));
  }
  return sum;
}
function sesquilinear(A,u,v){
  if(!(A instanceof LA.Matrix))A=new LA.Matrix(A);if(!(u instanceof LA.Vector))u=new LA.Vector(u);if(!(v instanceof LA.Vector))v=new LA.Vector(v);
  if(A.rows!==u.length||A.cols!==v.length)throw new AdvancedLinearAlgebraError("MATRIX_SHAPE_ERROR","Sesquilinear-form dimensions do not match");
  return u.dot(A.multiply(v));
}
function inertia(A,options){
  if(!(A instanceof LA.Matrix))A=new LA.Matrix(A);
  var sd=spectralDecomposition(A,options),tol=(options&&options.tol)||1e-9,p=0,n=0,z=0;
  sd.values.forEach(function(v){if(v>tol)p++;else if(v<-tol)n++;else z++;});
  var type=p&&n?"indefinite":n===0&&z===0?"positive definite":p===0&&z===0?"negative definite":n===0?"positive semidefinite":p===0?"negative semidefinite":"indefinite";
  return {positive:p,negative:n,zero:z,signature:p-n,rank:p+n,classification:type,eigenvalues:sd.values,spectral:sd,
    toString:function(){return "inertia = ("+p+", "+n+", "+z+"); signature = "+(p-n)+"; "+type;}};
}
function congruenceCanonical(A,options){
  var it=inertia(A,options),Q=it.spectral.Q,scales=it.eigenvalues.map(function(l){return Math.abs(l)>1e-9?1/Math.sqrt(Math.abs(l)):1;}),
    S=Q.multiply(LA.Matrix.diagonal(scales)),C=S.transpose().multiply(A).multiply(S),
    expected=LA.Matrix.diagonal(it.eigenvalues.map(function(l){return l>1e-9?1:l<-1e-9?-1:0;})),res=C.sub(expected).frobeniusNorm();
  if(res>1e-7)throw new AdvancedLinearAlgebraError("CONGRUENCE_CERTIFICATE_FAILED","Congruence canonical form failed S^T A S = diag(signs)",{residual:res});
  return {S:S,C:C,canonical:expected,inertia:it,residual:res,method:"spectral-congruence-canonical-form"};
}

/* SVD applications and conditioning ------------------------------------ */
function lowRankApproximation(A,k,options){
  if(!(A instanceof LA.Matrix))A=new LA.Matrix(A);k=Number(k);
  if(!Number.isInteger(k)||k<0||k>Math.min(A.rows,A.cols))throw new AdvancedLinearAlgebraError("INVALID_RANK","Low-rank approximation k must be an integer from 0 to min(rows,cols)");
  var N=numericMatrix(numericRows(A)),d=LA.svd(N,options),use=Math.min(k,d.singularValues.length),approx;
  if(use===0)approx=LA.Matrix.zeros(A.rows,A.cols);
  else{
    var U=LA.Matrix.fromColumns(Array.from({length:use},function(_,i){return d.U.col(i);})),
      V=LA.Matrix.fromColumns(Array.from({length:use},function(_,i){return d.V.col(i);})),
      S=LA.Matrix.diagonal(d.singularValues.slice(0,use));
    approx=U.multiply(S).multiply(V.transpose());
  }
  var tail=d.singularValues.slice(use),froError=Math.sqrt(tail.reduce(function(s,x){return s+x*x;},0)),spectralError=tail.length?tail[0]:0,actual=N.sub(approx).frobeniusNorm();
  if(Math.abs(actual-froError)>1e-7*Math.max(1,actual,froError))throw new AdvancedLinearAlgebraError("LOW_RANK_CERTIFICATE_FAILED","Low-rank approximation error does not match truncated SVD spectrum",{actual:actual,predicted:froError});
  return {approximation:approx,k:k,effectiveRank:use,singularValues:d.singularValues,frobeniusError:froError,spectralError:spectralError,actualFrobeniusError:actual,method:"truncated-svd-eckart-young"};
}
function pseudoinverseDiagnostics(A,options){
  if(!(A instanceof LA.Matrix))A=new LA.Matrix(A);var N=numericMatrix(numericRows(A)),p=LA.pseudoinverse(N,options),P=p.matrix,
    aa=N.multiply(P),bb=P.multiply(N),
    r1=N.multiply(P).multiply(N).sub(N).frobeniusNorm(),
    r2=P.multiply(N).multiply(P).sub(P).frobeniusNorm(),
    r3=aa.transpose().sub(aa).frobeniusNorm(),
    r4=bb.transpose().sub(bb).frobeniusNorm(),
    cond=LA.conditionNumber(N,options);
  return {matrix:P,rank:p.rank,singularValues:p.singularValues,conditionNumber:cond,penroseResiduals:[r1,r2,r3,r4],method:"svd-moore-penrose-diagnostics",
    toString:function(){return "rank = "+p.rank+"; cond2 = "+(Number.isFinite(cond)?M.formatNumber(cond,8):"∞")+"; Penrose residuals = ["+[r1,r2,r3,r4].map(function(x){return M.formatNumber(x,4);}).join(", ")+"]";}};
}
function leastSquaresV2(A,b,options){
  if(!(A instanceof LA.Matrix))A=new LA.Matrix(A);if(!(b instanceof LA.Vector))b=new LA.Vector(b);
  var N=numericMatrix(numericRows(A)),bn=new LA.Vector(b.values.map(realNumber)),d=LA.leastSquares(N,bn,options),normal=N.transpose().multiply(d.residualVector),normalResidual=normal.norm(),
    ns=LA.nullSpace(N,options),minNormResidual=0;
  ns.vectors.forEach(function(v){minNormResidual=Math.max(minNormResidual,Math.abs(M.toNumber(v.dot(d.solution))));});
  return {solution:d.solution,residualVector:d.residualVector,residualNorm:d.residualNorm,normalEquationResidual:normalResidual,minNormOrthogonalityResidual:minNormResidual,rank:d.rank,method:"svd-minimum-norm-least-squares",
    toString:function(){return "x = "+d.solution.toString(10)+"; ||Ax-b|| = "+M.formatNumber(d.residualNorm,8)+"; ||A^T r|| = "+M.formatNumber(normalResidual,4);}};
}
function conditionReport(A,options){
  if(!(A instanceof LA.Matrix))A=new LA.Matrix(A);var N=numericMatrix(numericRows(A)),d=LA.svd(N,options),cond=LA.conditionNumber(N,options),
    reciprocal=Number.isFinite(cond)&&cond>0?1/cond:0,classification=!Number.isFinite(cond)?"singular / rank deficient":cond<1e3?"well-conditioned":cond<1e8?"moderately ill-conditioned":"severely ill-conditioned";
  return {rank:d.rank,singularValues:d.singularValues,conditionNumber:cond,reciprocalCondition:reciprocal,threshold:d.threshold,classification:classification,
    toString:function(){return "rank = "+d.rank+"; cond2 = "+(Number.isFinite(cond)?M.formatNumber(cond,8):"∞")+"; "+classification;}};
}

/* Similarity / basis workflows ----------------------------------------- */
function similarityTransform(A,P){
  if(!(A instanceof LA.Matrix))A=new LA.Matrix(A);if(!(P instanceof LA.Matrix))P=new LA.Matrix(P);
  if(!A.isSquare()||!P.isSquare()||A.rows!==P.rows)throw new AdvancedLinearAlgebraError("MATRIX_SHAPE_ERROR","Similarity transform requires square A and P of equal size");
  var Pinv=P.inverse(),B=Pinv.multiply(A).multiply(P),res=A.multiply(P).sub(P.multiply(B)).frobeniusNorm();
  if(res>1e-8*Math.max(1,A.frobeniusNorm(),P.frobeniusNorm()))throw new AdvancedLinearAlgebraError("SIMILARITY_CERTIFICATE_FAILED","Similarity transform failed AP=PB verification",{residual:res});
  return {matrix:B,P:P,Pinv:Pinv,residual:res,method:"basis-similarity-transform"};
}
function basisChange(fromMatrix,toMatrix){
  if(!(fromMatrix instanceof LA.Matrix))fromMatrix=new LA.Matrix(fromMatrix);if(!(toMatrix instanceof LA.Matrix))toMatrix=new LA.Matrix(toMatrix);
  if(fromMatrix.rows!==toMatrix.rows||fromMatrix.cols!==toMatrix.cols||fromMatrix.rows!==fromMatrix.cols)throw new AdvancedLinearAlgebraError("MATRIX_SHAPE_ERROR","Basis matrices must be square and have equal dimensions");
  var from=new LA.Basis(Array.from({length:fromMatrix.cols},function(_,i){return fromMatrix.col(i);}),fromMatrix.rows),
    to=new LA.Basis(Array.from({length:toMatrix.cols},function(_,i){return toMatrix.col(i);}),toMatrix.rows);
  if(!from.isIndependent()||!to.isIndependent())throw new AdvancedLinearAlgebraError("INVALID_BASIS","Both basis matrices must have independent columns");
  var C=LA.changeOfBasis(from,to),res=toMatrix.multiply(C).sub(fromMatrix).frobeniusNorm();
  if(res>1e-8*Math.max(1,fromMatrix.frobeniusNorm()))throw new AdvancedLinearAlgebraError("BASIS_CHANGE_CERTIFICATE_FAILED","Basis transition failed B_to C = B_from verification",{residual:res});
  return {matrix:C,residual:res,method:"coordinate-basis-transition"};
}

/* Matrix-workspace routing ---------------------------------------------- */
const MATRIX_OPS=new Set(["jordanv2","schur","spectral","inertia","projector","cond"]);
function supportsOperation(op){return MATRIX_OPS.has(op);}
function resultSummary(op,A,options){
  if(op==="jordanv2"){var d=jordanFormV2(A,options);return {kind:"decomposition",value:d,label:"AP = PJ (Jordan V2)"};}
  if(op==="schur"){var s=realSchur(A,options);return {kind:"decomposition",value:s,label:"AQ = QT (real Schur)"};}
  if(op==="spectral"){var sp=spectralDecomposition(A,options);return {kind:"decomposition",value:{Q:sp.Q,D:sp.D,residual:sp.residual,orthogonalityResidual:sp.orthogonalityResidual,method:sp.method},label:"AQ = QD"};}
  if(op==="inertia"){var it=inertia(A,options);return {kind:"text",value:it,label:"Inertia",display:it.toString()};}
  if(op==="projector"){var pr=orthogonalProjector(A);return {kind:"matrix",value:pr.P,label:"Orthogonal projector onto Col(A)",metadata:pr};}
  if(op==="cond"){var cr=conditionReport(A,options);return {kind:"text",value:cr,label:"Conditioning",display:cr.toString()};}
  throw new UnsupportedAdvancedLinearAlgebraError("Unknown U5 matrix operation '"+op+"'");
}

/* Calculate command router --------------------------------------------- */
function runCommand(raw,options){
  raw=String(raw).trim();options=options||{};
  var p=parseSemicolon(raw,"jordanv2");
  if(p){
    if(p.length!==1)throw new AdvancedLinearAlgebraError("ARITY_ERROR","jordanv2 expects jordanv2(row1|row2|...)");
    var d=jordanFormV2(parseMatrix(p[0]),options),sizes=d.blocks.map(function(b){return b.size;});
    return commandResult("J = "+d.J.toString(10)+"; block sizes = ["+sizes.join(", ")+"]; residual = "+M.formatNumber(d.residual,4),"jordan-v2",{value:d.J,metadata:{operation:"jordanv2",P:d.P.toJSON(),blocks:d.blocks.map(function(b){return {eigenvalue:b.eigenvalueDisplay,size:b.size};}),residual:d.residual}});
  }

  p=parseSemicolon(raw,"jordanchains");
  if(p){
    if(p.length!==1)throw new AdvancedLinearAlgebraError("ARITY_ERROR","jordanchains expects jordanchains(matrix)");
    var jc=jordanFormV2(parseMatrix(p[0]),options);
    return commandResult(jc.chains.map(function(ch,i){return "chain "+(i+1)+": λ="+ch.eigenvalueDisplay+", length "+ch.length;}).join("; "),"jordan-chains",{value:jc.J,metadata:{operation:"jordanchains",chains:jc.chains.map(function(ch){return {eigenvalue:ch.eigenvalueDisplay,length:ch.length,vectors:ch.vectors.map(function(v){return v.toJSON();});};})}});
  }

  p=parseSemicolon(raw,"schur");
  if(p){
    if(p.length!==1)throw new AdvancedLinearAlgebraError("ARITY_ERROR","schur expects schur(matrix)");
    var sc=realSchur(parseMatrix(p[0]),options);
    return commandResult("T = "+sc.T.toString(10)+"; residual = "+M.formatNumber(sc.residual,4),"schur",{value:sc.T,metadata:{operation:"schur",Q:sc.Q.toJSON(),residual:sc.residual,orthogonalityResidual:sc.orthogonalityResidual,iterations:sc.iterations}});
  }

  p=parseSemicolon(raw,"spectral");
  if(p){
    if(p.length!==1)throw new AdvancedLinearAlgebraError("ARITY_ERROR","spectral expects spectral(real symmetric matrix)");
    var sd=spectralDecomposition(parseMatrix(p[0]),options);
    return commandResult("eigenvalues = ["+sd.values.map(function(v){return M.formatNumber(v,10);}).join(", ")+"]; residual = "+M.formatNumber(sd.residual,4),"spectral",{value:sd.D,metadata:{operation:"spectral",Q:sd.Q.toJSON(),values:sd.values,residual:sd.residual,orthogonalityResidual:sd.orthogonalityResidual}});
  }

  p=parseSemicolon(raw,"matrixfunc");
  if(p){
    if(p.length<2||p.length>3)throw new AdvancedLinearAlgebraError("ARITY_ERROR","matrixfunc expects matrixfunc(matrix; exp|sqrt|log|sin|cos|abs|sign|invsqrt|pow; optional exponent)");
    var mf=matrixFunctionSymmetric(parseMatrix(p[0]),p[1].toLowerCase(),p[2],options);
    return commandResult(mf.matrix.toString(10),"matrix-function",{value:mf.matrix,metadata:{operation:"matrixfunc",function:mf.functionName,parameter:mf.parameter,verification:mf.verification}});
  }

  p=parseSemicolon(raw,"gram");
  if(p){
    if(p.length!==1)throw new AdvancedLinearAlgebraError("ARITY_ERROR","gram expects gram(matrix with vectors as columns)");
    var gr=gramMatrix(parseMatrix(p[0]));
    return commandResult(gr.toString(10),"gram-matrix",{value:gr,metadata:{operation:"gram"}});
  }

  p=parseSemicolon(raw,"orthonormalize");
  if(p){
    if(p.length!==1)throw new AdvancedLinearAlgebraError("ARITY_ERROR","orthonormalize expects orthonormalize(matrix with vectors as columns)");
    var oq=orthonormalizeColumns(parseMatrix(p[0]),options);
    return commandResult("Q = "+oq.Q.toString(10)+"; rank = "+oq.rank+"; residual = "+M.formatNumber(oq.residual,4),"orthonormalization",{value:oq.Q,metadata:{operation:"orthonormalize",R:oq.R.toJSON(),rank:oq.rank,residual:oq.residual,orthogonalityResidual:oq.orthogonalityResidual}});
  }

  p=parseSemicolon(raw,"projector");
  if(p){
    if(p.length!==1)throw new AdvancedLinearAlgebraError("ARITY_ERROR","projector expects projector(matrix whose columns span the subspace)");
    var pr=orthogonalProjector(parseMatrix(p[0]));
    return commandResult(pr.P.toString(10),"projector",{value:pr.P,metadata:{operation:"projector",rank:pr.rank,idempotenceResidual:pr.idempotenceResidual,hermitianResidual:pr.hermitianResidual}});
  }

  p=parseSemicolon(raw,"project");
  if(p){
    if(p.length!==2)throw new AdvancedLinearAlgebraError("ARITY_ERROR","project expects project(matrix basis columns; vector)");
    var pm=parseMatrix(p[0]),pv=parseVector(p[1]),proj=orthogonalProjector(pm),out=proj.P.multiply(pv);
    return commandResult(out.toString(10),"projection",{value:out,metadata:{operation:"project",projectorRank:proj.rank}});
  }

  p=parseSemicolon(raw,"bilinear");
  if(p){
    if(p.length!==3)throw new AdvancedLinearAlgebraError("ARITY_ERROR","bilinear expects bilinear(matrix; u; v)");
    var bv=realBilinear(parseMatrix(p[0]),parseVector(p[1]),parseVector(p[2]));
    return commandResult(M.formatValue(bv),"bilinear-form",{value:bv,metadata:{operation:"bilinear"}});
  }

  p=parseSemicolon(raw,"sesquilinear");
  if(p){
    if(p.length!==3)throw new AdvancedLinearAlgebraError("ARITY_ERROR","sesquilinear expects sesquilinear(matrix; u; v)");
    var sv=sesquilinear(parseMatrix(p[0]),parseVector(p[1]),parseVector(p[2]));
    return commandResult(M.formatValue(sv),"sesquilinear-form",{value:sv,metadata:{operation:"sesquilinear"}});
  }

  p=parseSemicolon(raw,"quadratic");
  if(p){
    if(p.length!==2)throw new AdvancedLinearAlgebraError("ARITY_ERROR","quadratic expects quadratic(matrix; vector)");
    var qm=parseMatrix(p[0]),qv=parseVector(p[1]),q=sesquilinear(qm,qv,qv);
    return commandResult(M.formatValue(q),"quadratic-form",{value:q,metadata:{operation:"quadratic"}});
  }

  p=parseSemicolon(raw,"inertia");
  if(p){
    if(p.length!==1)throw new AdvancedLinearAlgebraError("ARITY_ERROR","inertia expects inertia(real symmetric matrix)");
    var it=inertia(parseMatrix(p[0]),options);
    return commandResult(it.toString(),"inertia",{value:it.signature,metadata:{operation:"inertia",positive:it.positive,negative:it.negative,zero:it.zero,signature:it.signature,rank:it.rank,classification:it.classification}});
  }

  p=parseSemicolon(raw,"congruence");
  if(p){
    if(p.length!==1)throw new AdvancedLinearAlgebraError("ARITY_ERROR","congruence expects congruence(real symmetric matrix)");
    var cg=congruenceCanonical(parseMatrix(p[0]),options);
    return commandResult("C = "+cg.canonical.toString(10)+"; inertia = ("+cg.inertia.positive+", "+cg.inertia.negative+", "+cg.inertia.zero+"); residual = "+M.formatNumber(cg.residual,4),"congruence-canonical",{value:cg.canonical,metadata:{operation:"congruence",S:cg.S.toJSON(),residual:cg.residual,signature:cg.inertia.signature}});
  }

  p=parseSemicolon(raw,"lowrank");
  if(p){
    if(p.length!==2)throw new AdvancedLinearAlgebraError("ARITY_ERROR","lowrank expects lowrank(matrix; k)");
    var lr=lowRankApproximation(parseMatrix(p[0]),Number(p[1]),options);
    return commandResult("A_"+lr.k+" = "+lr.approximation.toString(10)+"; ||A-A_k||F = "+M.formatNumber(lr.frobeniusError,8)+"; ||.||2 = "+M.formatNumber(lr.spectralError,8),"low-rank",{value:lr.approximation,metadata:{operation:"lowrank",k:lr.k,effectiveRank:lr.effectiveRank,frobeniusError:lr.frobeniusError,spectralError:lr.spectralError,singularValues:lr.singularValues}});
  }

  p=parseSemicolon(raw,"pinvdiag");
  if(p){
    if(p.length!==1)throw new AdvancedLinearAlgebraError("ARITY_ERROR","pinvdiag expects pinvdiag(matrix)");
    var pd=pseudoinverseDiagnostics(parseMatrix(p[0]),options);
    return commandResult(pd.toString(),"pseudoinverse-diagnostics",{value:pd.matrix,metadata:{operation:"pinvdiag",rank:pd.rank,conditionNumber:pd.conditionNumber,penroseResiduals:pd.penroseResiduals,singularValues:pd.singularValues}});
  }

  p=parseSemicolon(raw,"lstsqv2");
  if(p){
    if(p.length!==2)throw new AdvancedLinearAlgebraError("ARITY_ERROR","lstsqv2 expects lstsqv2(matrix; b-vector)");
    var ls=leastSquaresV2(parseMatrix(p[0]),parseVector(p[1]),options);
    return commandResult(ls.toString(),"least-squares-v2",{value:ls.solution,metadata:{operation:"lstsqv2",residualNorm:ls.residualNorm,normalEquationResidual:ls.normalEquationResidual,minNormOrthogonalityResidual:ls.minNormOrthogonalityResidual,rank:ls.rank}});
  }

  p=parseSemicolon(raw,"condreport");
  if(p){
    if(p.length!==1)throw new AdvancedLinearAlgebraError("ARITY_ERROR","condreport expects condreport(matrix)");
    var cr=conditionReport(parseMatrix(p[0]),options);
    return commandResult(cr.toString(),"condition-report",{value:Number.isFinite(cr.conditionNumber)?cr.conditionNumber:Infinity,metadata:{operation:"condreport",rank:cr.rank,singularValues:cr.singularValues,conditionNumber:cr.conditionNumber,reciprocalCondition:cr.reciprocalCondition,threshold:cr.threshold,classification:cr.classification}});
  }

  p=parseSemicolon(raw,"similarity");
  if(p){
    if(p.length!==2)throw new AdvancedLinearAlgebraError("ARITY_ERROR","similarity expects similarity(A; P)");
    var sm=similarityTransform(parseMatrix(p[0]),parseMatrix(p[1]));
    return commandResult(sm.matrix.toString(10),"similarity-transform",{value:sm.matrix,metadata:{operation:"similarity",residual:sm.residual}});
  }

  p=parseSemicolon(raw,"basischange");
  if(p){
    if(p.length!==2)throw new AdvancedLinearAlgebraError("ARITY_ERROR","basischange expects basischange(B_from; B_to), with basis vectors as columns");
    var bc=basisChange(parseMatrix(p[0]),parseMatrix(p[1]));
    return commandResult(bc.matrix.toString(10),"basis-change",{value:bc.matrix,metadata:{operation:"basischange",residual:bc.residual}});
  }

  if(/^u5help\s*\(\s*\)$/i.test(raw)){
    return commandResult("U5: jordanv2 · jordanchains · schur · spectral · matrixfunc · gram · orthonormalize · projector · project · bilinear · sesquilinear · quadratic · inertia · congruence · lowrank · pinvdiag · lstsqv2 · condreport · similarity · basischange","advanced-linear-algebra-help",{metadata:{operation:"u5help"}});
  }
  return null;
}

global.CalcAdvancedLinearAlgebra={
  VERSION:"2.4.0-u5",
  AdvancedLinearAlgebraError:AdvancedLinearAlgebraError,UnsupportedAdvancedLinearAlgebraError:UnsupportedAdvancedLinearAlgebraError,SchurConvergenceError:SchurConvergenceError,
  realSchur:realSchur,spectralDecomposition:spectralDecomposition,matrixFunctionSymmetric:matrixFunctionSymmetric,
  jordanFormV2:jordanFormV2,
  gramMatrix:gramMatrix,orthonormalizeColumns:orthonormalizeColumns,orthogonalProjector:orthogonalProjector,realBilinear:realBilinear,sesquilinear:sesquilinear,inertia:inertia,congruenceCanonical:congruenceCanonical,
  lowRankApproximation:lowRankApproximation,pseudoinverseDiagnostics:pseudoinverseDiagnostics,leastSquaresV2:leastSquaresV2,conditionReport:conditionReport,
  similarityTransform:similarityTransform,basisChange:basisChange,
  supportsOperation:supportsOperation,resultSummary:resultSummary,
  runCommand:runCommand
};
})(window);
