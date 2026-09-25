"use strict";
global.window=global;
require("../math.js");
require("../algebra.js");
require("../linear-algebra.js");
require("../advanced-linear-algebra.js");

const M=global.CalcMath;
const L=global.CalcLinearAlgebra;
const U=global.CalcAdvancedLinearAlgebra;

function assert(cond,msg){if(!cond)throw new Error(msg||"Assertion failed");}
function eq(a,b,msg){if(a!==b)throw new Error((msg||"Mismatch")+": expected "+b+", got "+a);}
function approx(a,b,tol,msg){if(Math.abs(a-b)>tol*Math.max(1,Math.abs(a),Math.abs(b)))throw new Error((msg||"Approx mismatch")+": expected "+b+", got "+a);}
function throwsCode(fn,code,msg){
  let ok=false;
  try{fn();}catch(e){ok=true;if(e.code!==code)throw new Error((msg||"Wrong error")+": expected "+code+", got "+e.code+" / "+e.message);}
  if(!ok)throw new Error((msg||"Expected error")+": "+code);
}
function r(n,d){return new M.Rational(BigInt(n),d===undefined?1n:BigInt(d));}
function exact(rows){return new L.Matrix(rows.map(row=>row.map(x=>x instanceof M.Rational||x instanceof M.Complex?x:r(x))));}
function num(A){return A.data.map(row=>row.map(M.toNumber));}
function quasiUpper(A,tol){
  tol=tol||1e-7;const X=num(A),n=X.length;
  for(let i=0;i<n;i++)for(let j=0;j<i-1;j++)if(Math.abs(X[i][j])>tol)return false;
  for(let i=1;i<n-1;i++)if(Math.abs(X[i][i-1])>tol&&Math.abs(X[i+1][i])>tol)return false;
  return true;
}
function matApprox(A,B,tol,msg){const R=A.sub(B).frobeniusNorm();if(R>tol*Math.max(1,A.frobeniusNorm(),B.frobeniusNorm()))throw new Error((msg||"Matrix mismatch")+": residual "+R);}

// Jordan V2: chains beyond the old 2x2 boundary.
let A=exact([[2,1,0],[0,2,1],[0,0,2]]);
let J=U.jordanFormV2(A);
eq(J.blocks.length,1,"single 3x3 Jordan block");
eq(J.blocks[0].size,3,"3x3 block size");
assert(J.residual<1e-12,"3x3 Jordan residual");
matApprox(A.multiply(J.P),J.P.multiply(J.J),1e-12,"3x3 AP=PJ");

A=exact([[2,1,0,0],[0,2,0,0],[0,0,2,1],[0,0,0,2]]);
J=U.jordanFormV2(A);
eq(J.blocks.map(b=>b.size).sort().join(","),"2,2","two Jordan blocks");
matApprox(A.multiply(J.P),J.P.multiply(J.J),1e-12,"4x4 AP=PJ");

A=exact([[5,1,0,0,0],[0,5,1,0,0],[0,0,5,0,0],[0,0,0,2,1],[0,0,0,0,2]]);
J=U.jordanFormV2(A);
eq(J.blocks.map(b=>b.size).sort().join(","),"2,3","mixed Jordan block sizes");
assert(J.chains.reduce((s,c)=>s+c.length,0)===5,"Jordan chains span full space");

// Exact complex diagonalization is also valid Jordan form.
A=exact([[0,-1],[1,0]]);
J=U.jordanFormV2(A);
eq(J.blocks.length,2,"rotation has two complex 1x1 Jordan blocks");
assert(J.residual<1e-12,"complex Jordan residual");

// Real Schur.
A=new L.Matrix([[4,1,-2],[1,2,0],[-2,0,3]]);
let S=U.realSchur(A,{tol:1e-11,maxIterations:8000});
assert(S.residual<1e-8,"symmetric Schur residual");
assert(S.orthogonalityResidual<1e-8,"symmetric Schur orthogonality");
assert(quasiUpper(S.T),"symmetric Schur quasi-upper triangular");
matApprox(A.multiply(S.Q),S.Q.multiply(S.T),1e-8,"AQ=QT");

A=new L.Matrix([[1,4,2],[3,2,5],[0,1,3]]);
S=U.realSchur(A,{tol:1e-11,maxIterations:8000});
assert(S.residual<1e-8,"general Schur residual");
assert(S.orthogonalityResidual<1e-8,"general Schur orthogonality");
assert(quasiUpper(S.T),"general Schur quasi-upper triangular");

// A real 2x2 complex-eigenvalue block is already a valid real Schur block.
A=new L.Matrix([[0,-1],[1,0]]);
S=U.realSchur(A);
assert(quasiUpper(S.T),"rotation 2x2 real Schur block");
matApprox(A.multiply(S.Q),S.Q.multiply(S.T),1e-12,"rotation Schur reconstruction");

// Spectral theorem for real symmetric matrices.
A=new L.Matrix([[2,1],[1,2]]);
const sp=U.spectralDecomposition(A);
approx(sp.values[0],3,1e-10,"spectral lambda1");
approx(sp.values[1],1,1e-10,"spectral lambda2");
assert(sp.residual<1e-10&&sp.orthogonalityResidual<1e-10,"spectral certificate");
matApprox(A.multiply(sp.Q),sp.Q.multiply(sp.D),1e-10,"spectral AQ=QD");
let sumP=L.Matrix.zeros(2,2);
sp.projectors.forEach(P=>{
  matApprox(P.multiply(P),P,1e-10,"spectral projector idempotence");
  sumP=sumP.add(P);
});
matApprox(sumP,L.Matrix.identity(2),1e-10,"spectral projectors resolve identity");
throwsCode(()=>U.spectralDecomposition(new L.Matrix([[1,2],[0,1]])),"UNSUPPORTED_ADVANCED_LINEAR_ALGEBRA","nonsymmetric spectral boundary");

// Spectral matrix functions.
let mf=U.matrixFunctionSymmetric(new L.Matrix([[4,0],[0,9]]),"sqrt");
matApprox(mf.matrix,new L.Matrix([[2,0],[0,3]]),1e-12,"matrix square root");
assert(mf.verification.squareResidual<1e-12,"sqrt verification");

mf=U.matrixFunctionSymmetric(new L.Matrix([[4,0],[0,9]]),"invsqrt");
matApprox(mf.matrix,new L.Matrix([[0.5,0],[0,1/3]]),1e-10,"inverse square root");
assert(mf.verification.whiteningResidual<1e-10,"invsqrt verification");

const SPD=new L.Matrix([[2,1],[1,2]]);
const logA=U.matrixFunctionSymmetric(SPD,"log").matrix;
const expLog=U.matrixFunctionSymmetric(logA,"exp").matrix;
matApprox(expLog,SPD,1e-8,"exp(log(A))=A");

const pHalf=U.matrixFunctionSymmetric(new L.Matrix([[4,0],[0,9]]),"pow",0.5).matrix;
matApprox(pHalf,new L.Matrix([[2,0],[0,3]]),1e-10,"spectral fractional power");
throwsCode(()=>U.matrixFunctionSymmetric(new L.Matrix([[-1,0],[0,2]]),"sqrt"),"MATRIX_FUNCTION_DOMAIN","PSD domain enforcement");
throwsCode(()=>U.matrixFunctionSymmetric(new L.Matrix([[0,0],[0,2]]),"log"),"MATRIX_FUNCTION_DOMAIN","PD log domain enforcement");

// Gram matrices and complex inner-product spaces.
const cm=new L.Matrix([[r(1),new M.Complex(0,1)],[new M.Complex(0,1),r(1)]]);
const G=U.gramMatrix(cm);
eq(G.toString(),"[[2, 0], [0, 2]]","complex Gram matrix");
const oq=U.orthonormalizeColumns(cm);
assert(oq.rank===2,"complex orthonormalization rank");
matApprox(oq.Q.conjugateTranspose().multiply(oq.Q),L.Matrix.identity(2),1e-10,"complex Q*Q=I");
matApprox(oq.Q.multiply(oq.R),cm,1e-10,"complex QR reconstruction");

const dep=new L.Matrix([[1,2],[2,4],[0,0]]);
const oq2=U.orthonormalizeColumns(dep);
eq(oq2.rank,1,"dependent columns reduce rank");

// Orthogonal projectors.
let pr=U.orthogonalProjector(new L.Matrix([[1,0],[1,0],[0,1]]));
eq(pr.rank,2,"projector rank");
assert(pr.idempotenceResidual<1e-10&&pr.hermitianResidual<1e-10,"projector certificates");
matApprox(pr.P.multiply(pr.P),pr.P,1e-10,"P^2=P");

// Bilinear/sesquilinear/quadratic forms.
const form=exact([[2,1],[1,3]]);
eq(M.formatValue(U.realBilinear(form,new L.Vector([r(1),r(2)]),new L.Vector([r(3),r(4)]))),"40","exact bilinear form");
eq(M.formatValue(U.sesquilinear(form,new L.Vector([r(1),r(2)]),new L.Vector([r(1),r(2)]))),"18","quadratic form");

// Inertia / signature / Sylvester congruence.
const indef=new L.Matrix([[2,0],[0,-3]]);
let it=U.inertia(indef);
eq(it.positive,1,"inertia positive");
eq(it.negative,1,"inertia negative");
eq(it.zero,0,"inertia zero");
eq(it.signature,0,"inertia signature");
eq(it.classification,"indefinite","inertia classification");

const semidef=new L.Matrix([[4,0,0],[0,0,0],[0,0,-2]]);
it=U.inertia(semidef);
eq([it.positive,it.negative,it.zero].join(","),"1,1,1","three-way inertia");

const cg=U.congruenceCanonical(indef);
matApprox(cg.C,cg.canonical,1e-8,"congruence canonical form");
eq(cg.canonical.toString(),"[[1, 0], [0, -1]]","Sylvester sign canonical form");

// SVD applications.
A=new L.Matrix([[3,0],[0,2],[0,0]]);
let lr=U.lowRankApproximation(A,1);
matApprox(lr.approximation,new L.Matrix([[3,0],[0,0],[0,0]]),1e-10,"rank-1 approximation");
approx(lr.frobeniusError,2,1e-10,"Eckart-Young Frobenius error");
approx(lr.spectralError,2,1e-10,"Eckart-Young spectral error");

lr=U.lowRankApproximation(A,2);
assert(lr.actualFrobeniusError<1e-10,"full numerical rank approximation exact");

let pd=U.pseudoinverseDiagnostics(new L.Matrix([[1,0],[0,0]]));
eq(pd.rank,1,"pseudoinverse diagnostic rank");
assert(pd.penroseResiduals.every(x=>x<1e-10),"all four Penrose equations");
assert(!Number.isFinite(pd.conditionNumber),"rank deficient condition number infinite");

const dependent=new L.Matrix([[1,2,3],[2,4,6],[1,1,2],[0,1,1]]);
pd=U.pseudoinverseDiagnostics(dependent);
eq(pd.rank,2,"certified SVD drops numerical null-direction noise");
assert(pd.penroseResiduals.every(x=>x<1e-8),"rank-deficient Penrose equations remain certified");
assert(!Number.isFinite(pd.conditionNumber),"exactly dependent columns report infinite condition number");

// Least-squares V2.
let ls=U.leastSquaresV2(new L.Matrix([[1,0],[0,1],[1,1]]),new L.Vector([1,2,4]));
approx(ls.solution.values[0],4/3,1e-9,"least squares x1");
approx(ls.solution.values[1],7/3,1e-9,"least squares x2");
assert(ls.normalEquationResidual<1e-9,"normal equations residual");

ls=U.leastSquaresV2(new L.Matrix([[1,1],[2,2]]),new L.Vector([2,4]));
approx(ls.solution.values[0],1,1e-9,"minimum-norm LS x1");
approx(ls.solution.values[1],1,1e-9,"minimum-norm LS x2");
assert(ls.minNormOrthogonalityResidual<1e-8,"minimum-norm nullspace orthogonality");

// Conditioning.
let cr=U.conditionReport(new L.Matrix([[1,0],[0,0.001]]));
approx(cr.conditionNumber,1000,1e-8,"condition number");
eq(cr.rank,2,"condition rank");
assert(cr.classification.includes("ill-conditioned"),"condition classification");
cr=U.conditionReport(new L.Matrix([[1,0],[0,0]]));
assert(!Number.isFinite(cr.conditionNumber)&&cr.rank===1,"singular condition report");
cr=U.conditionReport(dependent);
eq(cr.rank,2,"dependent-column condition rank");
assert(!Number.isFinite(cr.conditionNumber),"dependent-column condition infinite");

// Similarity and basis transitions.
const sim=U.similarityTransform(exact([[2,1],[0,3]]),exact([[1,1],[0,1]]));
eq(sim.matrix.toString(),"[[2, 0], [0, 3]]","similarity transform");
matApprox(exact([[2,1],[0,3]]).multiply(sim.P),sim.P.multiply(sim.matrix),1e-12,"similarity residual");

const bc=U.basisChange(exact([[1,0],[0,1]]),exact([[1,1],[0,1]]));
eq(bc.matrix.toString(),"[[1, -1], [0, 1]]","basis change matrix");
matApprox(exact([[1,1],[0,1]]).multiply(bc.matrix),exact([[1,0],[0,1]]),1e-12,"basis transition reconstruction");

// Matrix-workspace summaries.
assert(U.supportsOperation("schur")&&U.supportsOperation("jordanv2")&&U.supportsOperation("cond"),"U5 matrix operations registered");
eq(U.resultSummary("inertia",indef).kind,"text","inertia matrix summary");
eq(U.resultSummary("projector",new L.Matrix([[1],[1]])).kind,"matrix","projector matrix summary");

// Calculate command surface.
assert(U.runCommand("jordanv2(2,1,0|0,2,1|0,0,2)").display.includes("block sizes = [3]"),"jordanv2 command");
assert(U.runCommand("jordanchains(2,1,0|0,2,1|0,0,2)").display.includes("length 3"),"jordanchains command");
assert(U.runCommand("schur(1,4,2|3,2,5|0,1,3)").display.includes("residual"),"schur command");
assert(U.runCommand("spectral(2,1|1,2)").display.includes("eigenvalues"),"spectral command");
eq(U.runCommand("matrixfunc(4,0|0,9; sqrt)").display,"[[2, 0], [0, 3]]","matrixfunc command");
eq(U.runCommand("gram(1,i|i,1)").display,"[[2, 0], [0, 2]]","gram command");
assert(U.runCommand("orthonormalize(1,i|i,1)").display.includes("rank = 2"),"orthonormalize command");
assert(U.runCommand("projector(1,0|1,0|0,1)").display.includes("0.5"),"projector command");
eq(U.runCommand("bilinear(2,1|1,3; 1,2; 3,4)").display,"40","bilinear command");
assert(U.runCommand("inertia(2,0|0,-3)").display.includes("inertia = (1, 1, 0)"),"inertia command");
assert(U.runCommand("congruence(2,0|0,-3)").display.includes("[[1, 0], [0, -1]]"),"congruence command");
assert(U.runCommand("lowrank(3,0|0,2|0,0; 1)").display.includes("||A-A_k||F = 2"),"lowrank command");
assert(U.runCommand("pinvdiag(1,0|0,0)").display.includes("Penrose residuals"),"pinvdiag command");
assert(U.runCommand("lstsqv2(1,0|0,1|1,1; 1,2,3)").display.includes("||Ax-b|| = 0"),"least squares command");
assert(U.runCommand("condreport(1,0|0,0.001)").display.includes("cond2 = 1000"),"condition command");
eq(U.runCommand("similarity(2,1|0,3; 1,1|0,1)").display,"[[2, 0], [0, 3]]","similarity command");
eq(U.runCommand("basischange(1,0|0,1; 1,1|0,1)").display,"[[1, -1], [0, 1]]","basischange command");
assert(U.runCommand("u5help()").display.includes("jordanv2")&&U.runCommand("u5help()").display.includes("matrixfunc"),"U5 help");
eq(U.runCommand("2+2"),null,"ordinary expressions ignored by U5 router");

console.log("Advanced Linear Algebra U5 certification tests passed");
