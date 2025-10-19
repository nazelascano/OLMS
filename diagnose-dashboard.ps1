# Dashboard Diagnostic Script
Write-Host "`n=== DASHBOARD DIAGNOSTIC ===" -ForegroundColor Cyan

# Check transactions file
Write-Host "`n1. Checking transactions file..." -ForegroundColor Yellow
$transFile = "c:\Users\Lenovo\Downloads\OLMS Copilot\backend\data\transactions.json"
if (Test-Path $transFile) {
    $trans = Get-Content $transFile | ConvertFrom-Json
    Write-Host "  File exists: YES" -ForegroundColor Green
    Write-Host "  Transactions in file: $($trans.Count)" -ForegroundColor Green
    Write-Host "  First transaction status: $($trans[0].status)" -ForegroundColor Gray
    Write-Host "  First transaction borrowDate: $($trans[0].borrowDate)" -ForegroundColor Gray
    Write-Host "  First transaction dueDate: $($trans[0].dueDate)" -ForegroundColor Gray
} else {
    Write-Host "  File exists: NO" -ForegroundColor Red
}

# Test API
Write-Host "`n2. Testing API endpoint..." -ForegroundColor Yellow
try {
    Start-Sleep -Seconds 2
    $login = Invoke-WebRequest -Uri "http://localhost:5001/api/auth/login" `
        -Method POST `
        -ContentType "application/json" `
        -Body '{"usernameOrEmail":"admin","password":"admin123456"}'
    
    $token = ($login.Content | ConvertFrom-Json).token
    $headers = @{ "Authorization" = "Bearer $token" }
    
    Write-Host "  Login: SUCCESS" -ForegroundColor Green
    
    # Get stats
    $stats = Invoke-WebRequest -Uri "http://localhost:5001/api/reports/stats" -Headers $headers
    $data = ($stats.Content | ConvertFrom-Json)
    
    Write-Host "`n  Dashboard Data:" -ForegroundColor Cyan
    Write-Host "    Total Books: $($data.totalBooks)" -ForegroundColor White
    Write-Host "    Borrowed Books: $($data.borrowedBooks)" -ForegroundColor White
    Write-Host "    Overdue Books: $($data.overdueBooks)" -ForegroundColor White
    Write-Host "    Total Transactions: $($data.totalTransactions)" -ForegroundColor White
    
    # Get transactions directly
    Write-Host "`n3. Fetching transactions directly..." -ForegroundColor Yellow
    $transResponse = Invoke-WebRequest -Uri "http://localhost:5001/api/transactions" -Headers $headers
    $transData = ($transResponse.Content | ConvertFrom-Json)
    
    if ($transData.transactions) {
        Write-Host "  API returned: $($transData.transactions.Count) transactions" -ForegroundColor $(if($transData.transactions.Count -gt 0){"Green"}else{"Red"})
        if ($transData.transactions.Count -gt 0) {
            Write-Host "  Sample transaction:" -ForegroundColor Gray
            Write-Host "    ID: $($transData.transactions[0].id)" -ForegroundColor Gray
            Write-Host "    Status: $($transData.transactions[0].status)" -ForegroundColor Gray
            Write-Host "    Borrow Date: $($transData.transactions[0].borrowDate)" -ForegroundColor Gray
        }
    } else {
        Write-Host "  API returned: Unknown format" -ForegroundColor Red
    }
    
} catch {
    Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== DIAGNOSTIC COMPLETE ===`n" -ForegroundColor Cyan
