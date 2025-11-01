const fetch = global.fetch || require('node-fetch');
(async ()=>{
  try{
    const base='http://localhost:5001/api';
    // login as admin
    const login=await fetch(`${base}/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({usernameOrEmail:'admin',password:'admin123456'})});
    const loginJson=await login.json();
    if(!login.ok){console.error('admin login failed',loginJson);process.exit(1)}
    const token=loginJson.token;
    const students=[{firstName:'Bulk',lastName:'User',studentId:'BULK1',lrn:'BULKLRN1',grade:'Grade 7',section:'Bulk'}];
    const res=await fetch(`${base}/students/bulk-import`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({students})});
    const json=await res.text();
    console.log('status',res.status); console.log('body',json);
  }catch(e){console.error(e)}
})();
