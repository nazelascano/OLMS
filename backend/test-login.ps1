$ProgressPreference = 'SilentlyContinue'
$body = @{ usernameOrEmail = 'admin'; password = 'admin123456' } | ConvertTo-Json
$response = Invoke-RestMethod -Uri 'http://localhost:5001/api/auth/login' -Method Post -Body $body -ContentType 'application/json'
$response | ConvertTo-Json -Depth 4
