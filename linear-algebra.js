(function(global){
"use strict";

const M=global.CalcMath;
const A=global.CalcAlgebra;
if(!M||!A)throw new Error("CalcMath and CalcAlgebra must load before CalcLinearAlgebra");

class LinearAlgebraError extends M.CalcError{
  constructor(code,message,details){super(code||"LINEAR_ALGEBRA_ERROR",message,undefined,undefined,details);}
}
class MatrixShapeError extends LinearAlgebraError{constructor(message,details){super("MATRIX_SHAPE_ERROR",message,details);}}
class SingularMatrixError extends LinearAlgebraError{constructor(message,details){super("SINGULAR_MATRIX",message||"Matrix is singular",details);}}
class NumericalStabilityError extends LinearAlgebraError{constructor(message,details){super("NUMERICAL_STABILITY_ERROR",message,details);}}
class UnsupportedLinearAlgebraError extends LinearAlgebraError{constructor(message,details){super("UNSUPPORTED_LINEAR_ALGEBRA",message,details);}}
class PositiveDefiniteError extends LinearAlgebraError{constructor(message){super("NOT_POSITIVE_DEFINITE",message||"Matrix is not positive definite");}}

const DEFAULT_NUMERICAL=Object.freeze({
  absTol:1e-12,
  relTol:1e-10,
  rankTol:1e-10,
  maxIterations:200
});

function rat(n,d){return new M.Rational(BigInt(n),d===undefined?1n:BigInt(d));}
function isSym(v){return v instanceof A.SymbolicExpression;}
function toSym(v){return isSym(v)?v:new A.SymbolicExpression(M.formatValue(v));}
function sAdd(x,y){return isSym(x)||isSym(y)?new A.SymbolicExpression("("+toSym(x).toString()+")+("+toSym(y).toString()+")").simplify():M.add(x,y);}
function sSub(x,y){return isSym(x)||isSym(y)?new A.SymbolicExpression("("+toSym(x).toString()+")-("+toSym(y).toString()+")").simplify():M.sub(x,y);}
function sMul(x,y){return isSym(x)||isSym(y)?new A.SymbolicExpression("("+toSym(x).toString()+")*("+toSym(y).toString()+")").simplify():M.mul(x,y);}
function sDiv(x,y){return isSym(x)||isSym(y)?new A.SymbolicExpression("("+toSym(x).toString()+")/("+toSym(y).toString()+")").simplify():M.div(x,y);}
function sNeg(x){return isSym(x)?new A.SymbolicExpression("-("+x.toString()+")").simplify():M.neg(x);}
function sConj(x){
  if(x instanceof M.Complex)return x.conjugate();
  if(isSym(x))return x;
  return x;
}
function sAbs(x){
  if(x instanceof M.Rational)return Math.abs(x.toNumber());
  if(x instanceof M.Complex)return x.abs();
  if(isSym(x))return NaN;
  return Math.abs(Number(x));
}
function sNumber(x){
  if(isSym(x))return NaN;
  return M.toNumber(x);
}
function sZero(x,tol){
  if(isSym(x))return x.toString()==="0";
  if(x instanceof M.Rational)return x.isZero();
  if(x instanceof M.Complex)return x.abs()<=(tol||1e-12);
  return Math.abs(Number(x))<=(tol||1e-12);
}
function sOne(x,tol){
  if(isSym(x))return x.toString()==="1";
  if(x instanceof M.Rational)return x.equals(rat(1));
  if(x instanceof M.Complex)return Math.abs(M.toNumber(x)-1)<=(tol||1e-12);
  return Math.abs(Number(x)-1)<=(tol||1e-12);
}
function scalarExact(x){
  if(x instanceof M.Rational)return true;
  if(x instanceof M.Complex)return M.isExactValue(x);
  return false;
}
function scalarDomain(x){
  if(isSym(x))return "symbolic";
  if(x instanceof M.Complex)return "complex";
  if(x instanceof M.Rational)return x.isInteger()?"integer":"rational";
  return "real";
}
function combineDomain(a,b){
  const order=["integer","rational","real","complex","symbolic"];
  return order[Math.max(order.indexOf(a),order.indexOf(b))];
}
function formatScalar(x,p){return isSym(x)?x.toString():M.formatValue(x,p||12);}

class Vector{
  constructor(values,options){
    if(!Array.isArray(values))throw new MatrixShapeError("Vector values must be an array");
    this.values=values.slice();this.length=this.values.length;this.orientation=options&&options.orientation||"column";
    this.domain=this.values.reduce(function(d,v){return combineDomain(d,scalarDomain(v));},"integer");
    Object.freeze(this.values);Object.freeze(this);
  }
  get(i){if(i<0||i>=this.length)throw new MatrixShapeError("Vector index out of range");return this.values[i];}
  add(v){this.assertSize(v);return new Vector(this.values.map((x,i)=>sAdd(x,v.values[i])));}
  sub(v){this.assertSize(v);return new Vector(this.values.map((x,i)=>sSub(x,v.values[i])));}
  scale(c){return new Vector(this.values.map(x=>sMul(x,c)));}
  dot(v){
    this.assertSize(v);let sum=rat(0);
    for(let i=0;i<this.length;i++)sum=sAdd(sum,sMul(sConj(this.values[i]),v.values[i]));
    return sum;
  }
  norm(){const d=this.dot(this),n=sNumber(d);if(!Number.isFinite(n)||n<0)throw new UnsupportedLinearAlgebraError("Vector norm requires numeric scalar entries");return Math.sqrt(Math.max(0,n));}
  normalize(){const n=this.norm();if(n<=DEFAULT_NUMERICAL.absTol)throw new LinearAlgebraError("ZERO_VECTOR","Cannot normalize the zero vector");return this.scale(1/n);}
  distance(v){return this.sub(v).norm();}
  angle(v){
    const den=this.norm()*v.norm();if(den===0)throw new LinearAlgebraError("ZERO_VECTOR","Angle is undefined for a zero vector");
    const z=sNumber(this.dot(v))/den;return Math.acos(Math.max(-1,Math.min(1,z)));
  }
  cross(v){
    this.assertSize(v);if(this.length!==3)throw new MatrixShapeError("Cross product requires 3D vectors");
    const a=this.values,b=v.values;
    return new Vector([
      sSub(sMul(a[1],b[2]),sMul(a[2],b[1])),
      sSub(sMul(a[2],b[0]),sMul(a[0],b[2])),
      sSub(sMul(a[0],b[1]),sMul(a[1],b[0]))
    ]);
  }
  outer(v){return new Matrix(this.values.map(x=>v.values.map(y=>sMul(x,sConj(y)))));}
  assertSize(v){if(!(v instanceof Vector)||v.length!==this.length)throw new MatrixShapeError("Vector dimensions do not match");}
  toString(p){return "["+this.values.map(x=>formatScalar(x,p)).join(", ")+"]";}
  toJSON(){return {type:"vector",orientation:this.orientation,values:this.values.map(serializeScalar)};}
  static fromJSON(d){return new Vector(d.values.map(deserializeScalar),{orientation:d.orientation});}
}

class Matrix{
  constructor(rows,options){
    if(!Array.isArray(rows))throw new MatrixShapeError("Matrix rows must be an array");
    const r=rows.length,c=r?rows[0].length:0;
    for(let i=0;i<r;i++)if(!Array.isArray(rows[i])||rows[i].length!==c)throw new MatrixShapeError("Matrix rows must all have the same length");
    this.rows=r;this.cols=c;this.data=rows.map(row=>row.slice());
    this.domain=this.data.flat().reduce(function(d,v){return combineDomain(d,scalarDomain(v));},"integer");
    this.exact=this.data.flat().every(scalarExact);
    Object.freeze(this.data);Object.freeze(this);
  }
  get(r,c){if(r<0||r>=this.rows||c<0||c>=this.cols)throw new MatrixShapeError("Matrix index out of range");return this.data[r][c];}
  row(r){return new Vector(this.data[r].slice(),{orientation:"row"});}
  col(c){return new Vector(this.data.map(row=>row[c]));}
  toRows(){return this.data.map(r=>r.slice());}
  map(fn){return new Matrix(this.data.map((row,i)=>row.map((v,j)=>fn(v,i,j))));}
  isSquare(){return this.rows===this.cols;}
  add(B){this.assertSame(B);return new Matrix(this.data.map((row,i)=>row.map((v,j)=>sAdd(v,B.data[i][j]))));}
  sub(B){this.assertSame(B);return new Matrix(this.data.map((row,i)=>row.map((v,j)=>sSub(v,B.data[i][j]))));}
  scale(c){return this.map(v=>sMul(v,c));}
  multiply(B){
    if(B instanceof Vector){if(this.cols!==B.length)throw new MatrixShapeError("Matrix-vector dimensions do not match");return new Vector(this.data.map(row=>row.reduce((s,v,k)=>sAdd(s,sMul(v,B.values[k])),rat(0))));}
    if(!(B instanceof Matrix)||this.cols!==B.rows)throw new MatrixShapeError("Matrix inner dimensions do not match");
    const out=Array.from({length:this.rows},()=>Array(B.cols));
    for(let i=0;i<this.rows;i++)for(let j=0;j<B.cols;j++){let sum=rat(0);for(let k=0;k<this.cols;k++)sum=sAdd(sum,sMul(this.data[i][k],B.data[k][j]));out[i][j]=sum;}
    return new Matrix(out);
  }
  power(n){
    if(!this.isSquare())throw new MatrixShapeError("Matrix powers require a square matrix");
    n=Number(n);if(!Number.isInteger(n))throw new UnsupportedLinearAlgebraError("Matrix exponent must be an integer");
    if(n<0)return this.inverse().power(-n);
    let result=Matrix.identity(this.rows),base=this,e=n;
    while(e>0){if(e&1)result=result.multiply(base);e=Math.floor(e/2);if(e)base=base.multiply(base);}return result;
  }
  transpose(){return new Matrix(Array.from({length:this.cols},(_,j)=>Array.from({length:this.rows},(_,i)=>this.data[i][j])));}
  conjugateTranspose(){return new Matrix(Array.from({length:this.cols},(_,j)=>Array.from({length:this.rows},(_,i)=>sConj(this.data[i][j]))));}
  trace(){if(!this.isSquare())throw new MatrixShapeError("Trace requires a square matrix");let s=rat(0);for(let i=0;i<this.rows;i++)s=sAdd(s,this.data[i][i]);return s;}
  determinant(){return determinant(this);}
  inverse(){return inverse(this);}
  rref(options){return rref(this,options);}
  rank(options){return rank(this,options);}
  nullity(options){return this.cols-this.rank(options);}
  frobeniusNorm(){let s=0;for(const row of this.data)for(const v of row){const a=sAbs(v);if(!Number.isFinite(a))throw new UnsupportedLinearAlgebraError("Norm requires numeric matrix entries");s+=a*a;}return Math.sqrt(s);}
  assertSame(B){if(!(B instanceof Matrix)||this.rows!==B.rows||this.cols!==B.cols)throw new MatrixShapeError("Matrix shapes do not match");}
  toString(p){return "["+this.data.map(r=>"["+r.map(v=>formatScalar(v,p)).join(", ")+"]").join(", ")+"]";}
  toJSON(){return {type:"matrix",rows:this.rows,cols:this.cols,data:this.data.map(row=>row.map(serializeScalar))};}
  static fromJSON(d){return new Matrix(d.data.map(row=>row.map(deserializeScalar)));}
  static zeros(r,c){return new Matrix(Array.from({length:r},()=>Array.from({length:c},()=>rat(0))));}
  static identity(n){return new Matrix(Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>rat(i===j?1:0))));}
  static diagonal(values){const v=values instanceof Vector?values.values:values;return new Matrix(v.map((x,i)=>v.map((_,j)=>i===j?x:rat(0))));}
  static fromColumns(vectors){
    if(!vectors.length)return new Matrix([]);
    const n=vectors[0].length;if(vectors.some(v=>v.length!==n))throw new MatrixShapeError("Column vectors must have equal length");
    return new Matrix(Array.from({length:n},(_,i)=>vectors.map(v=>v.values[i])));
  }
  static fromStrings(rows,env,options){
    options=options||{};env=env||{};
    return new Matrix(rows.map(function(row){
      return row.map(function(cell){
        try{
          const v=M.evaluate(String(cell),env,{commit:false,complex:true,angle:options.angle||"RAD"}).value;
          if(v instanceof M.Rational||v instanceof M.Complex||typeof v==="number")return v;
          throw new UnsupportedLinearAlgebraError("Matrix cells must be scalar values");
        }catch(e){
          if(options.symbolic&&e.code==="UNKNOWN_IDENTIFIER")return new A.SymbolicExpression(String(cell));
          throw e;
        }
      });
    }));
  }
}

function serializeScalar(v){
  if(isSym(v))return {type:"symbolic",value:v.toJSON()};
  return {type:"numeric",value:M.serializeValue(v)};
}
function deserializeScalar(d){
  if(d.type==="symbolic")return A.SymbolicExpression.fromJSON(d.value);
  return M.deserializeValue(d.value);
}

function pivotAbs(v){const a=sAbs(v);return Number.isFinite(a)?a:0;}
function choosePivot(rows,start,col,domain,tol){
  if(domain==="symbolic"){
    for(let r=start;r<rows.length;r++)if(!sZero(rows[r][col],tol))return r;
    return -1;
  }
  let p=start,best=-1;
  for(let r=start;r<rows.length;r++){
    const a=pivotAbs(rows[r][col]);if(a>best){best=a;p=r;}
  }
  if(best<=(tol||0))return -1;
  return p;
}

function determinant(A){
  if(!(A instanceof Matrix))A=new Matrix(A);
  if(!A.isSquare())throw new MatrixShapeError("Determinant requires a square matrix");
  const n=A.rows;if(n===0)return rat(1);
  const R=A.toRows();let sign=1,det=rat(1);
  for(let c=0;c<n;c++){
    let p=choosePivot(R,c,c,A.domain,A.exact?0:DEFAULT_NUMERICAL.absTol);
    if(p<0)return rat(0);
    if(p!==c){const t=R[p];R[p]=R[c];R[c]=t;sign*=-1;}
    const pivot=R[c][c];det=sMul(det,pivot);
    for(let r=c+1;r<n;r++){
      if(sZero(R[r][c]))continue;const f=sDiv(R[r][c],pivot);
      for(let j=c+1;j<n;j++)R[r][j]=sSub(R[r][j],sMul(f,R[c][j]));
      R[r][c]=rat(0);
    }
  }
  return sign<0?sNeg(det):det;
}

function rref(A,options){
  if(!(A instanceof Matrix))A=new Matrix(A);options=Object.assign({},DEFAULT_NUMERICAL,options||{});
  const R=A.toRows(),ops=[],pivots=[];let lead=0;
  for(let r=0;r<A.rows&&lead<A.cols;r++){
    let p=choosePivot(R,r,lead,A.domain,A.exact?0:options.rankTol);
    if(p<0){lead++;r--;continue;}
    if(p!==r){const t=R[p];R[p]=R[r];R[r]=t;ops.push({type:"swap",a:r,b:p});}
    const pv=R[r][lead];
    if(!sOne(pv,A.exact?0:options.rankTol)){
      for(let j=0;j<A.cols;j++)R[r][j]=sDiv(R[r][j],pv);
      ops.push({type:"scale",row:r,factor:sDiv(rat(1),pv)});
    }
    for(let i=0;i<A.rows;i++)if(i!==r&&!sZero(R[i][lead],A.exact?0:options.rankTol)){
      const f=R[i][lead];for(let j=0;j<A.cols;j++)R[i][j]=sSub(R[i][j],sMul(f,R[r][j]));
      ops.push({type:"add",target:i,source:r,factor:sNeg(f)});
    }
    pivots.push(lead);lead++;
  }
  return {matrix:new Matrix(R),pivots:pivots,operations:ops};
}
function rank(A,options){
  if(!(A instanceof Matrix))A=new Matrix(A);
  if(A.exact||A.domain==="symbolic")return rref(A,options).pivots.length;
  return numericalRank(A,options);
}
function inverse(A){
  if(!(A instanceof Matrix))A=new Matrix(A);if(!A.isSquare())throw new MatrixShapeError("Inverse requires a square matrix");
  const n=A.rows,aug=new Matrix(A.data.map((row,i)=>row.concat(Array.from({length:n},(_,j)=>rat(i===j?1:0))))),rr=rref(aug);
  for(let i=0;i<n;i++)for(let j=0;j<n;j++)if(!sZero(sSub(rr.matrix.data[i][j],rat(i===j?1:0)),A.exact?0:1e-9))throw new SingularMatrixError();
  return new Matrix(rr.matrix.data.map(row=>row.slice(n)));
}

function nullSpace(A,options){
  if(!(A instanceof Matrix))A=new Matrix(A);const rr=rref(A,options),piv=new Set(rr.pivots),free=[];
  for(let c=0;c<A.cols;c++)if(!piv.has(c))free.push(c);
  const vectors=[];
  for(const f of free){
    const x=Array.from({length:A.cols},()=>rat(0));x[f]=rat(1);
    rr.pivots.forEach((pc,row)=>{x[pc]=sNeg(rr.matrix.data[row][f]);});
    vectors.push(new Vector(x));
  }
  return new Basis(vectors,A.cols,{kind:"null-space"});
}
function columnSpace(A,options){
  if(!(A instanceof Matrix))A=new Matrix(A);const piv=rref(A,options).pivots;
  return new Basis(piv.map(c=>A.col(c)),A.rows,{kind:"column-space",sourceColumns:piv});
}
function rowSpace(A,options){
  if(!(A instanceof Matrix))A=new Matrix(A);const R=rref(A,options).matrix,v=[];
  for(let i=0;i<R.rows;i++)if(R.data[i].some(x=>!sZero(x,A.exact?0:1e-10)))v.push(R.row(i));
  return new Basis(v,A.cols,{kind:"row-space"});
}

class Basis{
  constructor(vectors,ambientDimension,options){
    this.vectors=(vectors||[]).slice();this.ambientDimension=ambientDimension===undefined?(this.vectors[0]?this.vectors[0].length:0):ambientDimension;
    if(this.vectors.some(v=>!(v instanceof Vector)||v.length!==this.ambientDimension))throw new MatrixShapeError("Basis vectors have inconsistent dimension");
    this.kind=options&&options.kind||"basis";this.sourceColumns=options&&options.sourceColumns||null;
    Object.freeze(this.vectors);Object.freeze(this);
  }
  dimension(){return this.vectors.length;}
  matrix(){return Matrix.fromColumns(this.vectors);}
  isIndependent(){return this.vectors.length===0||rank(this.matrix())===this.vectors.length;}
  contains(v){if(!(v instanceof Vector)||v.length!==this.ambientDimension)return false;if(!this.vectors.length)return v.values.every(x=>sZero(x));return spanCoordinates(this,v).consistent;}
  coordinates(v){
    const s=spanCoordinates(this,v);if(!s.consistent)throw new LinearAlgebraError("NOT_IN_SPAN","Vector is not in the span of this basis");
    if(s.freeVariables.length)throw new LinearAlgebraError("NON_UNIQUE_COORDINATES","Coordinates are not unique because the spanning set is dependent");
    return new Vector(s.solution);
  }
  toString(p){return "{"+this.vectors.map(v=>v.toString(p)).join(", ")+"}";}
}
function spanCoordinates(basis,v){
  if(!basis.vectors.length)return {consistent:v.values.every(x=>sZero(x)),solution:[],freeVariables:[]};
  const B=basis.matrix(),aug=new Matrix(B.data.map((row,i)=>row.concat([v.values[i]]))),rr=rref(aug),n=B.cols;
  for(let i=0;i<rr.matrix.rows;i++){let zero=true;for(let j=0;j<n;j++)if(!sZero(rr.matrix.data[i][j])){zero=false;break;}if(zero&&!sZero(rr.matrix.data[i][n]))return {consistent:false,solution:[],freeVariables:[]};}
  const piv=rr.pivots.filter(c=>c<n),free=[];for(let c=0;c<n;c++)if(piv.indexOf(c)<0)free.push(c);
  const sol=Array.from({length:n},()=>rat(0));piv.forEach((c,row)=>{sol[c]=rr.matrix.data[row][n];});
  return {consistent:true,solution:sol,freeVariables:free};
}
function changeOfBasis(fromBasis,toBasis){
  if(fromBasis.ambientDimension!==toBasis.ambientDimension||fromBasis.dimension()!==toBasis.dimension())throw new MatrixShapeError("Bases must span the same-dimensional ambient space");
  const cols=fromBasis.vectors.map(v=>toBasis.coordinates(v));return Matrix.fromColumns(cols);
}

function projectionOntoBasis(v,basis){
  const Q=modifiedGramSchmidt(basis.vectors).vectors;if(!Q.length)return new Vector(Array.from({length:v.length},()=>rat(0)));
  let out=new Vector(Array.from({length:v.length},()=>0));
  for(const q of Q){const coeff=q.dot(v),term=q.scale(coeff);out=out.add(term);}
  return out;
}
function orthogonalComplement(A,options){return nullSpace(A.conjugateTranspose(),options);}

function modifiedGramSchmidt(vectors){
  const Q=[];const R=Array.from({length:vectors.length},()=>Array.from({length:vectors.length},()=>0));
  for(let j=0;j<vectors.length;j++){
    let v=new Vector(vectors[j].values.map(sNumber));for(let i=0;i<Q.length;i++){const rij=sNumber(Q[i].dot(v));R[i][j]=rij;v=v.sub(Q[i].scale(rij));}
    const norm=v.norm();if(norm<=DEFAULT_NUMERICAL.rankTol)continue;R[Q.length][j]=norm;Q.push(v.scale(1/norm));
  }
  return {vectors:Q,R:new Matrix(R.slice(0,Q.length).map(row=>row.slice()))};
}

function toNumericMatrix(A){
  if(!(A instanceof Matrix))A=new Matrix(A);const out=A.data.map(row=>row.map(v=>{const n=sNumber(v);if(!Number.isFinite(n))throw new UnsupportedLinearAlgebraError("Numerical decomposition requires finite real entries");return n;}));
  return out;
}
function numericMatrix(rows){return new Matrix(rows.map(r=>r.map(Number)));}
function eyeNum(n){return Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>i===j?1:0));}
function mulNum(A,B){
  const m=A.length,n=B.length,p=B[0].length,R=Array.from({length:m},()=>Array(p).fill(0));
  for(let i=0;i<m;i++)for(let k=0;k<n;k++)for(let j=0;j<p;j++)R[i][j]+=A[i][k]*B[k][j];return R;
}
function transNum(A){return Array.from({length:A[0].length},(_,j)=>A.map(r=>r[j]));}
function subNum(A,B){return A.map((r,i)=>r.map((x,j)=>x-B[i][j]));}
function froNum(A){return Math.sqrt(A.reduce((s,r)=>s+r.reduce((q,x)=>q+x*x,0),0));}

function luDecomposition(A,options){
  if(!(A instanceof Matrix))A=new Matrix(A);if(!A.isSquare())throw new MatrixShapeError("LU decomposition requires a square matrix");
  options=Object.assign({},DEFAULT_NUMERICAL,options||{});const U=toNumericMatrix(A).map(r=>r.slice()),n=A.rows,L=eyeNum(n),P=eyeNum(n);let swaps=0;
  for(let k=0;k<n;k++){
    let p=k,max=Math.abs(U[k][k]);for(let i=k+1;i<n;i++)if(Math.abs(U[i][k])>max){max=Math.abs(U[i][k]);p=i;}
    if(max<=options.absTol)throw new SingularMatrixError("LU decomposition encountered a zero pivot");
    if(p!==k){[U[p],U[k]]=[U[k],U[p]];[P[p],P[k]]=[P[k],P[p]];for(let j=0;j<k;j++)[L[p][j],L[k][j]]=[L[k][j],L[p][j]];swaps++;}
    for(let i=k+1;i<n;i++){const f=U[i][k]/U[k][k];L[i][k]=f;U[i][k]=0;for(let j=k+1;j<n;j++)U[i][j]-=f*U[k][j];}
  }
  const PA=mulNum(P,toNumericMatrix(A)),LU=mulNum(L,U),res=froNum(subNum(PA,LU));
  return {P:numericMatrix(P),L:numericMatrix(L),U:numericMatrix(U),swaps:swaps,residual:res,method:"partial-pivot-lu"};
}

function qrDecomposition(A){
  if(!(A instanceof Matrix))A=new Matrix(A);const R=toNumericMatrix(A).map(r=>r.slice()),m=A.rows,n=A.cols,Q=eyeNum(m),limit=Math.min(m,n);
  for(let k=0;k<limit;k++){
    let norm=0;for(let i=k;i<m;i++)norm=Math.hypot(norm,R[i][k]);if(norm<=DEFAULT_NUMERICAL.absTol)continue;
    const sign=R[k][k]>=0?1:-1,v=Array(m-k).fill(0);for(let i=k;i<m;i++)v[i-k]=R[i][k];v[0]+=sign*norm;
    let vn=Math.sqrt(v.reduce((s,x)=>s+x*x,0));if(vn===0)continue;for(let i=0;i<v.length;i++)v[i]/=vn;
    for(let j=k;j<n;j++){let dot=0;for(let i=k;i<m;i++)dot+=v[i-k]*R[i][j];for(let i=k;i<m;i++)R[i][j]-=2*v[i-k]*dot;}
    for(let i=0;i<m;i++){let dot=0;for(let j=k;j<m;j++)dot+=Q[i][j]*v[j-k];for(let j=k;j<m;j++)Q[i][j]-=2*dot*v[j-k];}
  }
  const Qm=numericMatrix(Q),Rm=numericMatrix(R),res=froNum(subNum(mulNum(Q,R),toNumericMatrix(A))),orth=froNum(subNum(mulNum(transNum(Q),Q),eyeNum(m)));
  return {Q:Qm,R:Rm,residual:res,orthogonalityResidual:orth,method:"householder-qr"};
}

function cholesky(A,options){
  if(!(A instanceof Matrix))A=new Matrix(A);if(!A.isSquare())throw new MatrixShapeError("Cholesky requires a square matrix");
  options=Object.assign({},DEFAULT_NUMERICAL,options||{});const X=toNumericMatrix(A),n=A.rows;
  for(let i=0;i<n;i++)for(let j=0;j<n;j++)if(Math.abs(X[i][j]-X[j][i])>options.relTol*Math.max(1,Math.abs(X[i][j]),Math.abs(X[j][i])))throw new PositiveDefiniteError("Cholesky requires a symmetric real matrix");
  const L=Array.from({length:n},()=>Array(n).fill(0));
  for(let i=0;i<n;i++)for(let j=0;j<=i;j++){
    let sum=X[i][j];for(let k=0;k<j;k++)sum-=L[i][k]*L[j][k];
    if(i===j){if(sum<=options.absTol)throw new PositiveDefiniteError();L[i][j]=Math.sqrt(sum);}else L[i][j]=sum/L[j][j];
  }
  const res=froNum(subNum(mulNum(L,transNum(L)),X));
  return {L:numericMatrix(L),residual:res,method:"cholesky"};
}

function jacobiEigenSymmetric(A,options){
  if(!(A instanceof Matrix))A=new Matrix(A);if(!A.isSquare())throw new MatrixShapeError("Symmetric eigendecomposition requires square matrix");
  options=Object.assign({},DEFAULT_NUMERICAL,options||{});const X=toNumericMatrix(A).map(r=>r.slice()),n=A.rows,V=eyeNum(n);
  for(let i=0;i<n;i++)for(let j=0;j<n;j++)if(Math.abs(X[i][j]-X[j][i])>options.relTol*Math.max(1,Math.abs(X[i][j]),Math.abs(X[j][i])))throw new UnsupportedLinearAlgebraError("Jacobi eigensolver requires a real symmetric matrix");
  let iterations=0;
  for(;iterations<options.maxIterations*n*n;iterations++){
    let p=0,q=1,max=0;for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)if(Math.abs(X[i][j])>max){max=Math.abs(X[i][j]);p=i;q=j;}
    if(max<=options.absTol)break;
    const theta=(X[q][q]-X[p][p])/(2*X[p][q]),t=(theta>=0?1:-1)/(Math.abs(theta)+Math.sqrt(theta*theta+1)),c=1/Math.sqrt(t*t+1),s=t*c;
    const app=X[p][p],aqq=X[q][q],apq=X[p][q];X[p][p]=c*c*app-2*s*c*apq+s*s*aqq;X[q][q]=s*s*app+2*s*c*apq+c*c*aqq;X[p][q]=X[q][p]=0;
    for(let k=0;k<n;k++)if(k!==p&&k!==q){const akp=X[k][p],akq=X[k][q];X[k][p]=X[p][k]=c*akp-s*akq;X[k][q]=X[q][k]=s*akp+c*akq;}
    for(let k=0;k<n;k++){const vkp=V[k][p],vkq=V[k][q];V[k][p]=c*vkp-s*vkq;V[k][q]=s*vkp+c*vkq;}
  }
  if(iterations>=options.maxIterations*n*n)throw new NumericalStabilityError("Jacobi eigensolver did not converge");
  const vals=Array.from({length:n},(_,i)=>X[i][i]),idx=vals.map((v,i)=>i).sort((a,b)=>vals[b]-vals[a]),sortedVals=idx.map(i=>vals[i]),sortedV=V.map(row=>idx.map(i=>row[i]));
  const D=sortedVals.map((v,i)=>sortedVals.map((_,j)=>i===j?v:0)),res=froNum(subNum(mulNum(toNumericMatrix(A),sortedV),mulNum(sortedV,D)));
  return {values:sortedVals,vectors:numericMatrix(sortedV),residual:res,iterations:iterations,method:"jacobi-symmetric"};
}

function svd(A,options){
  if(!(A instanceof Matrix))A=new Matrix(A);options=Object.assign({},DEFAULT_NUMERICAL,options||{});
  const X=toNumericMatrix(A),At=transNum(X),AtA=numericMatrix(mulNum(At,X)),eig=jacobiEigenSymmetric(AtA,options),values=eig.values.map(v=>Math.sqrt(Math.max(0,v)));
  const max=values.length?values[0]:0,tol=options.rankTol*Math.max(A.rows,A.cols,1)*Math.max(1,max),keep=[];
  for(let i=0;i<values.length;i++)if(values[i]>tol)keep.push(i);
  const Vfull=toNumericMatrix(eig.vectors),sing=keep.map(i=>values[i]),Vcols=keep.map(i=>new Vector(Vfull.map(row=>row[i]))),Ucols=[];
  for(let k=0;k<keep.length;k++){const av=A.multiply(Vcols[k]),sigma=sing[k];Ucols.push(new Vector(av.values.map(x=>sNumber(x)/sigma)));}
  const U=Matrix.fromColumns(Ucols),V=Matrix.fromColumns(Vcols),S=Matrix.diagonal(sing),recon=U.multiply(S).multiply(V.transpose()),res=A.sub(recon).frobeniusNorm();
  return {U:U,S:S,V:V,singularValues:sing,rank:sing.length,residual:res,threshold:tol,method:"svd-via-symmetric-jacobi"};
}
function pseudoinverse(A,options){
  if(!(A instanceof Matrix))A=new Matrix(A);const d=svd(A,options);
  if(!d.singularValues.length)return Matrix.zeros(A.cols,A.rows);
  const Sinv=Matrix.diagonal(d.singularValues.map(s=>1/s));
  const pinv=d.V.multiply(Sinv).multiply(d.U.transpose());
  const A1=A.multiply(pinv).multiply(A),A2=pinv.multiply(A).multiply(pinv);
  return {matrix:pinv,rank:d.rank,residual1:A.sub(A1).frobeniusNorm(),residual2:pinv.sub(A2).frobeniusNorm(),singularValues:d.singularValues,method:"svd-pseudoinverse"};
}
function numericalRank(A,options){
  const d=svd(A,options);return d.rank;
}
function conditionNumber(A,options){
  const d=svd(A,options);if(d.rank<Math.min(A.rows,A.cols))return Infinity;
  if(!d.singularValues.length)return Infinity;return d.singularValues[0]/d.singularValues[d.singularValues.length-1];
}
function leastSquares(A,b,options){
  if(!(A instanceof Matrix))A=new Matrix(A);if(!(b instanceof Vector))b=new Vector(b);
  if(A.rows!==b.length)throw new MatrixShapeError("Least-squares dimensions do not match");
  const pinv=pseudoinverse(A,options),x=pinv.matrix.multiply(b),r=A.multiply(x).sub(b);
  return {solution:x,residualVector:r,residualNorm:r.norm(),rank:pinv.rank,method:"svd-least-squares"};
}

function characteristicPolynomial(X){
  if(!(X instanceof Matrix))X=new Matrix(X);if(!X.isSquare())throw new MatrixShapeError("Characteristic polynomial requires a square matrix");
  const n=X.rows;let B=Matrix.identity(n),coeff=[rat(1)];
  for(let k=1;k<=n;k++){
    const AB=X.multiply(B),ck=sDiv(sNeg(AB.trace()),rat(k));coeff.push(ck);B=AB.add(Matrix.identity(n).scale(ck));
  }
  const p=new A.Polynomial("lambda");
  for(let k=0;k<=n;k++)p.set(n-k,coeff[k]);
  return p;
}
function cayleyHamiltonResidual(A){
  if(!(A instanceof Matrix))A=new Matrix(A);const p=characteristicPolynomial(A),n=A.rows;let R=Matrix.zeros(n,n);
  for(let d=0;d<=p.degree;d++)R=R.add(A.power(d).scale(p.get(d)));
  return R;
}
function exactEigenvalues(A,domain){
  const p=characteristicPolynomial(A),sol=A2solve(p,domain||"complex");return sol;
}
function A2solve(p,domain){return A.solveEquation(p.toString()+" = 0","lambda",{domain:domain});}
function solutionValueNumeric(v){
  try{return M.evaluateAst(v.expression.ast,{}, {complex:true,angle:"RAD"},0);}catch(e){return null;}
}
function polynomialRootMultiplicity(poly,root){
  if(!(root instanceof M.Rational))return 1;
  let p=poly.clone(),m=0,factor=new A.Polynomial(poly.variable);factor.set(1,rat(1));factor.set(0,root.neg());
  while(p.degree>=1){
    const dm=p.divmod(factor);if(!dm.remainder.isZero())break;p=dm.quotient;m++;
  }
  return Math.max(1,m);
}
function eigenspace(A,lambda,options){
  if(!(A instanceof Matrix))A=new Matrix(A);const B=A.sub(Matrix.identity(A.rows).scale(lambda));return nullSpace(B,options);
}
function eigenAnalysis(A,options){
  if(!(A instanceof Matrix))A=new Matrix(A);options=options||{};
  if(!A.isSquare())throw new MatrixShapeError("Eigenanalysis requires square matrix");
  if(!A.exact){
    const symmetric=isSymmetric(A,options);
    if(!symmetric)throw new UnsupportedLinearAlgebraError("Numerical general eigenanalysis is not certified; use a real symmetric matrix or exact matrix");
    const e=jacobiEigenSymmetric(A,options);
    return {mode:"numeric-symmetric",values:e.values,eigenvectors:e.vectors,residual:e.residual,method:e.method};
  }
  const charpoly=characteristicPolynomial(A),vals=exactEigenvalues(A,options.domain||"complex"),spaces=[];
  if(vals.type==="finite")for(const sv of vals.values){
    const l=solutionValueNumeric(sv);
    if(l!==null){
      const space=eigenspace(A,l,options),alg=polynomialRootMultiplicity(charpoly,l);
      spaces.push({value:sv,scalar:l,space:space,algebraicMultiplicity:alg,geometricMultiplicity:space.dimension()});
    }
  }
  return {mode:"exact",characteristicPolynomial:charpoly,solutions:vals,eigenspaces:spaces,diagonalizable:spaces.reduce((s,x)=>s+x.geometricMultiplicity,0)===A.rows};
}
function diagonalize(A,options){
  const e=eigenAnalysis(A,options);if(e.mode==="numeric-symmetric"){
    return {P:e.eigenvectors,D:Matrix.diagonal(e.values),residual:e.residual,method:"orthogonal-diagonalization"};
  }
  const cols=[],diag=[];
  for(const item of e.eigenspaces)for(const v of item.space.vectors){cols.push(v);diag.push(item.scalar);}
  if(cols.length<A.rows)throw new UnsupportedLinearAlgebraError("Matrix does not have enough certified independent eigenvectors for diagonalization");
  const P=Matrix.fromColumns(cols.slice(0,A.rows)),D=Matrix.diagonal(diag.slice(0,A.rows)),res=A.multiply(P).sub(P.multiply(D)).frobeniusNorm();
  return {P:P,D:D,residual:res,method:"exact-eigenbasis"};
}

function isSymmetric(A,options){
  if(!(A instanceof Matrix))A=new Matrix(A);if(!A.isSquare())return false;const tol=(options&&options.relTol)||DEFAULT_NUMERICAL.relTol;
  for(let i=0;i<A.rows;i++)for(let j=0;j<A.cols;j++){const d=sSub(A.data[i][j],A.data[j][i]);if(A.exact){if(!sZero(d))return false;}else if(sAbs(d)>tol*Math.max(1,sAbs(A.data[i][j]),sAbs(A.data[j][i])))return false;}return true;
}
function isHermitian(A,options){
  if(!(A instanceof Matrix))A=new Matrix(A);if(!A.isSquare())return false;const tol=(options&&options.relTol)||DEFAULT_NUMERICAL.relTol;
  for(let i=0;i<A.rows;i++)for(let j=0;j<A.cols;j++){const d=sSub(A.data[i][j],sConj(A.data[j][i]));if(A.exact){if(!sZero(d))return false;}else if(sAbs(d)>tol*Math.max(1,sAbs(A.data[i][j]),sAbs(A.data[j][i])))return false;}return true;
}
function isOrthogonal(A,options){
  if(!(A instanceof Matrix)||!A.isSquare())return false;const R=A.transpose().multiply(A).sub(Matrix.identity(A.rows)).frobeniusNorm();return R<=((options&&options.relTol)||1e-9);
}
function isUnitary(A,options){
  if(!(A instanceof Matrix)||!A.isSquare())return false;const R=A.conjugateTranspose().multiply(A).sub(Matrix.identity(A.rows)).frobeniusNorm();return R<=((options&&options.relTol)||1e-9);
}
function isPositiveDefinite(A,options){try{cholesky(A,options);return true;}catch(e){if(e.code==="NOT_POSITIVE_DEFINITE")return false;throw e;}}

function minimalPolynomial(X){
  if(!(X instanceof Matrix))X=new Matrix(X);if(!X.isSquare()||!X.exact)throw new UnsupportedLinearAlgebraError("Minimal polynomial certification currently requires an exact square matrix");
  const n=X.rows,powers=[Matrix.identity(n)];
  for(let k=1;k<=n*n;k++){
    powers.push(powers[k-1].multiply(X));
    const rows=[];for(let i=0;i<n;i++)for(let j=0;j<n;j++)rows.push(powers.map(P=>P.data[i][j]));
    const N=nullSpace(new Matrix(rows));
    for(const v of N.vectors){
      if(!sZero(v.values[k])){
        const lead=v.values[k],poly=new A.Polynomial("lambda");
        for(let d=0;d<=k;d++)poly.set(d,sDiv(v.values[d],lead));
        return poly;
      }
    }
  }
  throw new UnsupportedLinearAlgebraError("Could not determine minimal polynomial within the certified degree bound");
}

function solveExactLinear(B,b){
  const aug=new Matrix(B.data.map((row,i)=>row.concat([b.values[i]]))),rr=rref(aug),n=B.cols;
  for(let i=0;i<rr.matrix.rows;i++){let zero=true;for(let j=0;j<n;j++)if(!sZero(rr.matrix.data[i][j])){zero=false;break;}if(zero&&!sZero(rr.matrix.data[i][n]))return null;}
  const x=Array.from({length:n},()=>rat(0));rr.pivots.filter(c=>c<n).forEach((c,row)=>x[c]=rr.matrix.data[row][n]);return new Vector(x);
}
function jordanFormExact(A){
  if(!(A instanceof Matrix))A=new Matrix(A);if(!A.isSquare()||!A.exact)throw new UnsupportedLinearAlgebraError("Jordan form is certified only for exact matrices");
  if(A.rows>4)throw new UnsupportedLinearAlgebraError("Jordan form is limited to exact matrices of size at most 4");
  try{const d=diagonalize(A,{domain:"complex"});return {P:d.P,J:d.D,residual:d.residual,method:"diagonal-jordan"};}catch(e){}
  if(A.rows!==2)throw new UnsupportedLinearAlgebraError("Non-diagonal Jordan construction is currently certified only for 2x2 exact matrices");
  const analysis=eigenAnalysis(A,{domain:"complex"});if(analysis.eigenspaces.length!==1)throw new UnsupportedLinearAlgebraError("Unsupported exact Jordan structure");
  const item=analysis.eigenspaces[0];if(item.space.vectors.length!==1)throw new UnsupportedLinearAlgebraError("Unsupported exact Jordan structure");
  const v1=item.space.vectors[0],B=A.sub(Matrix.identity(2).scale(item.scalar)),v2=solveExactLinear(B,v1);if(!v2)throw new UnsupportedLinearAlgebraError("Generalized eigenvector could not be constructed");
  const P=Matrix.fromColumns([v1,v2]),J=new Matrix([[item.scalar,rat(1)],[rat(0),item.scalar]]),res=A.multiply(P).sub(P.multiply(J)).frobeniusNorm();
  if(res>1e-9)throw new NumericalStabilityError("Jordan reconstruction failed");
  return {P:P,J:J,residual:res,method:"exact-2x2-jordan"};
}

class LinearTransformation{
  constructor(matrix){this.matrix=matrix instanceof Matrix?matrix:new Matrix(matrix);this.domainDimension=this.matrix.cols;this.codomainDimension=this.matrix.rows;}
  apply(v){return this.matrix.multiply(v);}
  kernel(){return nullSpace(this.matrix);}
  image(){return columnSpace(this.matrix);}
  rank(){return this.image().dimension();}
  nullity(){return this.kernel().dimension();}
  isInjective(){return this.nullity()===0;}
  isSurjective(){return this.rank()===this.codomainDimension;}
  compose(other){
    if(!(other instanceof LinearTransformation)||other.codomainDimension!==this.domainDimension)throw new MatrixShapeError("Linear transformation dimensions do not compose");
    return new LinearTransformation(this.matrix.multiply(other.matrix));
  }
}

function matrixFromWorkspaceStrings(rows,env,options){return Matrix.fromStrings(rows,env,options);}
function formatMatrix(A,p){if(!(A instanceof Matrix))A=new Matrix(A);return A.data.map(row=>row.map(v=>formatScalar(v,p)));}
function resultSummary(op,A,options){
  options=options||{};
  if(op==="det")return {kind:"scalar",value:A.determinant(),label:"det(A)"};
  if(op==="trace")return {kind:"scalar",value:A.trace(),label:"tr(A)"};
  if(op==="rref"){const rr=A.rref(options);return {kind:"matrix",value:rr.matrix,label:"RREF(A)",metadata:{pivots:rr.pivots,operations:rr.operations}};}
  if(op==="inverse")return {kind:"matrix",value:A.inverse(),label:"A⁻¹"};
  if(op==="transpose")return {kind:"matrix",value:A.transpose(),label:"Aᵀ"};
  if(op==="adjoint")return {kind:"matrix",value:A.conjugateTranspose(),label:"A*"};
  if(op==="rank")return {kind:"scalar",value:rat(A.rank(options)),label:"rank(A)"};
  if(op==="nullity")return {kind:"scalar",value:rat(A.nullity(options)),label:"nullity(A)"};
  if(op==="nullspace")return {kind:"basis",value:nullSpace(A,options),label:"Null(A)"};
  if(op==="colspace")return {kind:"basis",value:columnSpace(A,options),label:"Col(A)"};
  if(op==="rowspace")return {kind:"basis",value:rowSpace(A,options),label:"Row(A)"};
  if(op==="lu"){const d=luDecomposition(A,options);return {kind:"decomposition",value:d,label:"PA = LU"};}
  if(op==="qr"){const d=qrDecomposition(A);return {kind:"decomposition",value:d,label:"A = QR"};}
  if(op==="cholesky"){const d=cholesky(A,options);return {kind:"decomposition",value:d,label:"A = LLᵀ"};}
  if(op==="svd"){const d=svd(A,options);return {kind:"decomposition",value:d,label:"A = UΣVᵀ"};}
  if(op==="pinv"){const d=pseudoinverse(A,options);return {kind:"matrix",value:d.matrix,label:"A⁺",metadata:d};}
  if(op==="eigen")return {kind:"eigen",value:eigenAnalysis(A,options),label:"Eigenanalysis"};
  if(op==="diag")return {kind:"decomposition",value:diagonalize(A,options),label:"AP = PD"};
  if(op==="charpoly")return {kind:"polynomial",value:characteristicPolynomial(A),label:"χ_A(λ)"};
  if(op==="minpoly")return {kind:"polynomial",value:minimalPolynomial(A),label:"m_A(λ)"};
  if(op==="jordan")return {kind:"decomposition",value:jordanFormExact(A),label:"AP = PJ"};
  throw new UnsupportedLinearAlgebraError("Unknown Matrix operation '"+op+"'");
}

global.CalcLinearAlgebra={
  VERSION:"1.0.0-linear-algebra",
  DEFAULT_NUMERICAL:DEFAULT_NUMERICAL,
  LinearAlgebraError:LinearAlgebraError,MatrixShapeError:MatrixShapeError,SingularMatrixError:SingularMatrixError,NumericalStabilityError:NumericalStabilityError,UnsupportedLinearAlgebraError:UnsupportedLinearAlgebraError,PositiveDefiniteError:PositiveDefiniteError,
  Vector:Vector,Matrix:Matrix,Basis:Basis,LinearTransformation:LinearTransformation,
  determinant:determinant,rref:rref,rank:rank,inverse:inverse,nullSpace:nullSpace,columnSpace:columnSpace,rowSpace:rowSpace,orthogonalComplement:orthogonalComplement,
  changeOfBasis:changeOfBasis,projectionOntoBasis:projectionOntoBasis,modifiedGramSchmidt:modifiedGramSchmidt,
  luDecomposition:luDecomposition,qrDecomposition:qrDecomposition,cholesky:cholesky,svd:svd,pseudoinverse:pseudoinverse,leastSquares:leastSquares,conditionNumber:conditionNumber,numericalRank:numericalRank,
  jacobiEigenSymmetric:jacobiEigenSymmetric,characteristicPolynomial:characteristicPolynomial,cayleyHamiltonResidual:cayleyHamiltonResidual,eigenspace:eigenspace,eigenAnalysis:eigenAnalysis,diagonalize:diagonalize,minimalPolynomial:minimalPolynomial,jordanFormExact:jordanFormExact,
  isSymmetric:isSymmetric,isHermitian:isHermitian,isOrthogonal:isOrthogonal,isUnitary:isUnitary,isPositiveDefinite:isPositiveDefinite,
  matrixFromWorkspaceStrings:matrixFromWorkspaceStrings,formatMatrix:formatMatrix,resultSummary:resultSummary,
  serializeScalar:serializeScalar,deserializeScalar:deserializeScalar
};
})(window);