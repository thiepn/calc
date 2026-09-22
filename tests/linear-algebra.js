"use strict";
global.window=global;
require("../math.js");
require("../algebra.js");
require("../calculus.js");
require("../units.js");
require("../linear-algebra.js");

const M=global.CalcMath;
const L=global.CalcLinearAlgebra;

function assert(c,m){if(!c)throw new Error(m||"Assertion failed");}
function eq(a,b,m){if(a!==b)throw new Error((m||"Mismatch")+": expected "+b+", got "+a);}
function approx(a,b,t,m){if(Math.abs(a-b)>t)throw new Error((m||"Approx mismatch")+": expected "+b+", got "+a);}
function throwsCode(fn,code,m){let ok=false;try{fn();}catch(e){ok=true;if(e.code!==code)throw new Error((m||"Wrong error")+": expected "+code+", got "+e.code+" / "+e.message);}if(!ok)throw new Error((m||"Expected error")+": "+code);}
function matApprox(A,B,t,msg){
  assert(A.rows===B.rows&&A.cols===B.cols,(msg||"matrix")+" shape");
  for(let i=0;i<A.rows;i++)for(let j=0;j<A.cols;j++)approx(M.toNumber(A.get(i,j)),M.toNumber(B.get(i,j)),t,(msg||"matrix")+" ["+i+","+j+"]");
}
function zeroMatrix(A,t,msg){for(let i=0;i<A.rows;i++)for(let j=0;j<A.cols;j++)approx(M.toNumber(A.get(i,j)),0,t,(msg||"zero")+" ["+i+","+j+"]");}

// Canonical exact Matrix / Vector objects.
const A=new L.Matrix([[new M.Rational(1n),new M.Rational(2n)],[new M.Rational(3n),new M.Rational(4n)]]);
eq(A.domain,"integer","exact integer matrix domain");
eq(M.formatValue(A.determinant()),"-2","exact determinant");
matApprox(A.multiply(A.inverse()),L.Matrix.identity(2),1e-12,"exact inverse reconstruction");
eq(A.power(2).toString(),"[[7, 10], [15, 22]]","matrix exponentiation");
eq(A.transpose().toString(),"[[1, 3], [2, 4]]","transpose");
eq(M.formatValue(A.trace()),"5","trace");

// Complex adjoint and inner product convention <u,v> = sum conj(u_i)v_i.
const ci=new M.Complex(new M.Rational(1n),new M.Rational(1n));
const cm=new L.Matrix([[ci,new M.Complex(new M.Rational(0n),new M.Rational(1n))],[new M.Rational(2n),new M.Rational(3n)]]);
eq(cm.conjugateTranspose().toString(),"[[1 − i, 2], [−i, 3]]","complex adjoint");
const u=new L.Vector([ci,new M.Rational(2n)]);
const v=new L.Vector([new M.Rational(1n),new M.Complex(new M.Rational(0n),new M.Rational(1n))]);
eq(M.formatValue(u.dot(v)),"1 + i","Hermitian inner product");
eq(u.cross?new L.Vector([1,0,0]).cross(new L.Vector([0,1,0])).toString():"","[0, 0, 1]","cross product");

// RREF provenance, rank/nullity and canonical subspaces.
const R=new L.Matrix([[new M.Rational(1n),new M.Rational(2n),new M.Rational(3n)],[new M.Rational(2n),new M.Rational(4n),new M.Rational(6n)]]);
const rr=R.rref();
eq(rr.matrix.toString(),"[[1, 2, 3], [0, 0, 0]]","exact RREF");
eq(JSON.stringify(rr.pivots),JSON.stringify([0]),"RREF pivot columns");
assert(rr.operations.length>0,"RREF row-operation provenance");
eq(R.rank(),1,"exact rank");
eq(R.nullity(),2,"rank-nullity");
const ns=L.nullSpace(R);
eq(ns.dimension(),2,"null-space dimension");
for(const z of ns.vectors){
  const rz=R.multiply(z);
  assert(rz.values.every(x=>M.isZero(x)),"null-space vector annihilated");
}
const cs=L.columnSpace(R);
eq(cs.dimension(),1,"column-space dimension");
eq(JSON.stringify(cs.sourceColumns),JSON.stringify([0]),"column-space uses original pivot columns");
eq(cs.vectors[0].toString(),"[1, 2]","original column retained");
eq(L.rowSpace(R).dimension(),1,"row-space dimension");

// Basis, coordinates, change of basis and projection.
const e1=new L.Vector([new M.Rational(1n),new M.Rational(0n)]);
const e2=new L.Vector([new M.Rational(0n),new M.Rational(1n)]);
const std=new L.Basis([e1,e2],2);
assert(std.isIndependent(),"standard basis independent");
eq(std.coordinates(new L.Vector([new M.Rational(3n),new M.Rational(4n)])).toString(),"[3, 4]","basis coordinates");
const alt=new L.Basis([new L.Vector([1,1]),new L.Vector([1,-1])],2);
const cob=L.changeOfBasis(std,alt);
matApprox(cob,new L.Matrix([[0.5,0.5],[0.5,-0.5]]),1e-12,"change-of-basis matrix");
const proj=L.projectionOntoBasis(new L.Vector([3,4]),new L.Basis([new L.Vector([1,0])],2));
approx(proj.values[0],3,1e-12,"projection x");approx(proj.values[1],0,1e-12,"projection y");

// Modified Gram-Schmidt.
const mgs=L.modifiedGramSchmidt([new L.Vector([1,1,0]),new L.Vector([1,0,1])]);
eq(mgs.vectors.length,2,"MGS vector count");
approx(mgs.vectors[0].norm(),1,1e-12,"MGS first unit");
approx(mgs.vectors[1].norm(),1,1e-12,"MGS second unit");
approx(M.toNumber(mgs.vectors[0].dot(mgs.vectors[1])),0,1e-12,"MGS orthogonal");

// LU with partial pivoting.
const luA=new L.Matrix([[4,3],[6,3]]);
const lu=L.luDecomposition(luA);
assert(lu.residual<1e-10,"LU reconstruction residual");
matApprox(lu.P.multiply(luA),lu.L.multiply(lu.U),1e-10,"PA=LU");

// Householder QR.
const qrA=new L.Matrix([[1,1],[1,0],[0,1]]);
const qr=L.qrDecomposition(qrA);
assert(qr.residual<1e-10,"QR reconstruction residual");
assert(qr.orthogonalityResidual<1e-10,"QR orthogonality residual");
matApprox(qr.Q.multiply(qr.R),qrA,1e-10,"A=QR");

// Cholesky.
const spd=new L.Matrix([[4,2],[2,3]]);
const chol=L.cholesky(spd);
assert(chol.residual<1e-10,"Cholesky residual");
matApprox(chol.L.multiply(chol.L.transpose()),spd,1e-10,"A=LLt");
throwsCode(()=>L.cholesky(new L.Matrix([[1,2],[2,1]])),"NOT_POSITIVE_DEFINITE","indefinite Cholesky rejected");

// Symmetric eigendecomposition.
const sym=new L.Matrix([[2,1],[1,2]]);
const se=L.jacobiEigenSymmetric(sym);
approx(se.values[0],3,1e-10,"largest symmetric eigenvalue");
approx(se.values[1],1,1e-10,"second symmetric eigenvalue");
assert(se.residual<1e-9,"symmetric eigendecomposition residual");

// SVD and pseudoinverse.
const rect=new L.Matrix([[3,0],[0,2],[0,0]]);
const sv=L.svd(rect);
eq(sv.rank,2,"SVD rank");
approx(sv.singularValues[0],3,1e-10,"sigma1");
approx(sv.singularValues[1],2,1e-10,"sigma2");
assert(sv.residual<1e-9,"SVD reconstruction residual");
matApprox(sv.U.multiply(sv.S).multiply(sv.V.transpose()),rect,1e-9,"SVD reconstruction");

const rd=new L.Matrix([[1,2],[2,4],[3,6]]);
const pinv=L.pseudoinverse(rd);
assert(pinv.residual1<1e-8&&pinv.residual2<1e-8,"Moore-Penrose identities");
eq(pinv.rank,1,"rank-deficient pseudoinverse rank");

// Least squares and condition number.
const lsA=new L.Matrix([[1,1],[1,2],[1,3]]);
const lsb=new L.Vector([1,2,2]);
const ls=L.leastSquares(lsA,lsb);
approx(M.toNumber(ls.solution.values[0]),2/3,1e-8,"least squares intercept");
approx(M.toNumber(ls.solution.values[1]),0.5,1e-8,"least squares slope");
assert(ls.residualNorm>=0,"least squares residual");
approx(L.conditionNumber(new L.Matrix([[3,0],[0,1]])),3,1e-9,"condition number");
eq(L.conditionNumber(new L.Matrix([[1,2],[2,4]])),Infinity,"singular condition number");

// Exact characteristic polynomial and Cayley-Hamilton.
const D=new L.Matrix([[new M.Rational(2n),new M.Rational(0n)],[new M.Rational(0n),new M.Rational(3n)]]);
const cp=L.characteristicPolynomial(D);
eq(cp.toString(),"lambda ^ 2 - 5 * lambda + 6","characteristic polynomial");
zeroMatrix(L.cayleyHamiltonResidual(D),1e-12,"Cayley-Hamilton");

// Exact eigenspaces and diagonalization.
const ea=L.eigenAnalysis(D,{domain:"complex"});
eq(ea.mode,"exact","exact eigenanalysis mode");
eq(ea.eigenspaces.length,2,"two eigenspaces");
assert(ea.diagonalizable,"distinct diagonal matrix diagonalizable");
assert(ea.eigenspaces.every(x=>x.algebraicMultiplicity===1&&x.geometricMultiplicity===1),"simple eigenvalue multiplicities");
for(const item of ea.eigenspaces)for(const ev of item.space.vectors)zeroMatrix(new L.Matrix([D.multiply(ev).sub(ev.scale(item.scalar)).values]),1e-12,"eigenvector residual");
const diag=L.diagonalize(new L.Matrix([[2,0],[0,3]]));
assert(diag.residual<1e-12,"exact diagonalization residual");
matApprox(new L.Matrix([[2,0],[0,3]]).multiply(diag.P),diag.P.multiply(diag.D),1e-12,"AP=PD");

// Minimal polynomial.
eq(L.minimalPolynomial(D).toString(),"lambda ^ 2 - 5 * lambda + 6","minimal polynomial distinct diagonal");
eq(L.minimalPolynomial(new L.Matrix([[new M.Rational(2n),new M.Rational(0n)],[new M.Rational(0n),new M.Rational(2n)]])).toString(),"lambda - 2","minimal polynomial scalar matrix");

// Exact Jordan subset.
const J2=new L.Matrix([[new M.Rational(2n),new M.Rational(1n)],[new M.Rational(0n),new M.Rational(2n)]]);
const jf=L.jordanFormExact(J2);
assert(jf.residual<1e-12,"Jordan reconstruction residual");
matApprox(J2.multiply(jf.P),jf.P.multiply(jf.J),1e-12,"AP=PJ");

// Structural predicates.
assert(L.isSymmetric(sym),"symmetric predicate");
assert(L.isHermitian(cm)===false,"non-Hermitian predicate");
assert(L.isOrthogonal(new L.Matrix([[0,-1],[1,0]])),"orthogonal predicate");
assert(L.isPositiveDefinite(spd),"positive definite predicate");
assert(!L.isPositiveDefinite(new L.Matrix([[1,2],[2,1]])),"indefinite predicate");

// Linear transformation.
const T=new L.LinearTransformation(new L.Matrix([[1,0,0],[0,1,0]]));
eq(T.rank(),2,"transformation rank");
eq(T.nullity(),1,"transformation nullity");
assert(!T.isInjective()&&T.isSurjective(),"transformation injective/surjective");
eq(T.apply(new L.Vector([3,4,5])).toString(),"[3, 4]","transformation apply");

// Matrix serialization.
const wire=JSON.parse(JSON.stringify(D.toJSON()));
eq(L.Matrix.fromJSON(wire).toString(),D.toString(),"matrix serialization round trip");
const vwire=JSON.parse(JSON.stringify(new L.Vector([new M.Rational(1n,3n),new M.Complex(1,2)]).toJSON()));
eq(L.Vector.fromJSON(vwire).toString(),"[1/3, 1 + 2i]","vector serialization round trip");

// Workspace parser exactness and symbolic support.
const parsed=L.Matrix.fromStrings([["1/3","sqrt(4)"],["2","5"]],{}, {symbolic:true});
eq(parsed.toString(),"[[1/3, 2], [2, 5]]","workspace exact parsing");
const symbolic=L.Matrix.fromStrings([["x","1"],["0","x"]],{}, {symbolic:true});
eq(symbolic.domain,"symbolic","symbolic matrix domain");
eq(symbolic.trace().toString(),"2 * x","symbolic trace");
eq(symbolic.determinant().toString(),"x ^ 2","symbolic determinant");
eq(symbolic.rank(),2,"symbolic generic rank");

// Matrix result summary routing.
eq(L.resultSummary("rank",R).value.toString(),"1","result summary rank");
eq(L.resultSummary("charpoly",D).value.toString(),cp.toString(),"result summary charpoly");

console.log("Linear Algebra V2 certification tests passed");
