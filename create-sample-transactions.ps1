# OLMS Sample Transactions Creator
# Creates realistic borrow transactions for testing

Write-Host "`n=== OLMS SAMPLE TRANSACTIONS CREATOR ===" -ForegroundColor Cyan
Write-Host "Creating sample borrow transactions...`n" -ForegroundColor Cyan

$baseUrl = "http://localhost:5001/api"

# Login as Admin
Write-Host "Logging in as Admin..." -ForegroundColor Yellow

try {
    $loginResponse = Invoke-WebRequest -Uri "$baseUrl/auth/login" `
        -Method POST `
        -ContentType "application/json" `
        -Body '{"usernameOrEmail":"admin","password":"admin123456"}' `
        -ErrorAction Stop
    
    $loginData = ($loginResponse.Content | ConvertFrom-Json)
    $token = $loginData.token
    $headers = @{ 
        "Authorization" = "Bearer $token"
        "Content-Type" = "application/json"
    }
    
    Write-Host "Login successful!`n" -ForegroundColor Green
} catch {
    Write-Host "Login failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Get all books and students
Write-Host "Fetching books and students..." -ForegroundColor Yellow

try {
    $booksResponse = Invoke-WebRequest -Uri "$baseUrl/books" -Headers $headers -ErrorAction Stop
    $allBooks = ($booksResponse.Content | ConvertFrom-Json).books
    
    $studentsResponse = Invoke-WebRequest -Uri "$baseUrl/students" -Headers $headers -ErrorAction Stop
    $allStudents = ($studentsResponse.Content | ConvertFrom-Json).students
    
    Write-Host "Found $($allBooks.Count) books" -ForegroundColor Gray
    Write-Host "Found $($allStudents.Count) students`n" -ForegroundColor Gray
} catch {
    Write-Host "Failed to fetch data: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

if ($allBooks.Count -eq 0 -or $allStudents.Count -eq 0) {
    Write-Host "Insufficient data. Please run upload-simple-data.ps1 first." -ForegroundColor Red
    exit 1
}

# Create sample transaction scenarios
Write-Host "Creating sample transactions..." -ForegroundColor Yellow
Write-Host "Legend: [R]=Recent [O]=Overdue [D]=Due Soon`n" -ForegroundColor Gray

$transactionsCreated = 0
$transactionsFailed = 0

# Transaction scenarios with different dates
$scenarios = @(
    @{StudentIndex=0; BookTitle="Clean Code"; DaysAgo=3; Type="[R]"; Description="Recent borrow"},
    @{StudentIndex=1; BookTitle="Introduction to Algorithms"; DaysAgo=5; Type="[R]"; Description="Recent borrow"},
    @{StudentIndex=2; BookTitle="The Lean Startup"; DaysAgo=7; Type="[D]"; Description="Due soon"},
    @{StudentIndex=3; BookTitle="1984"; DaysAgo=10; Type="[D]"; Description="Due soon"},
    @{StudentIndex=4; BookTitle="Harry Potter"; DaysAgo=12; Type="[D]"; Description="Due in 2 days"},
    @{StudentIndex=5; BookTitle="The Hobbit"; DaysAgo=16; Type="[O]"; Description="Overdue by 2 days"},
    @{StudentIndex=6; BookTitle="Pride and Prejudice"; DaysAgo=20; Type="[O]"; Description="Overdue by 6 days"},
    @{StudentIndex=7; BookTitle="Atomic Habits"; DaysAgo=25; Type="[O]"; Description="Overdue by 11 days"},
    @{StudentIndex=8; BookTitle="The Great Gatsby"; DaysAgo=2; Type="[R]"; Description="Very recent"},
    @{StudentIndex=9; BookTitle="To Kill a Mockingbird"; DaysAgo=8; Type="[D]"; Description="Due in 6 days"}
)

foreach ($scenario in $scenarios) {
    try {
        # Find student
        if ($scenario.StudentIndex -ge $allStudents.Count) {
            Write-Host "  Skipping: Student index out of range" -ForegroundColor Yellow
            continue
        }
        
        $student = $allStudents[$scenario.StudentIndex]
        
        # Find book by title (partial match)
        $book = $allBooks | Where-Object { $_.title -like "*$($scenario.BookTitle)*" } | Select-Object -First 1
        
        if (-not $book) {
            Write-Host "  Skipping: Book '$($scenario.BookTitle)' not found" -ForegroundColor Yellow
            continue
        }
        
        # Get first available copy
        $availableCopy = $book.copies | Where-Object { $_.status -eq 'available' } | Select-Object -First 1
        
        if (-not $availableCopy) {
            Write-Host "  Skipping: No available copies of '$($book.title)'" -ForegroundColor Yellow
            continue
        }
        
        # Calculate dates
        $borrowDate = (Get-Date).AddDays(-$scenario.DaysAgo)
        $dueDate = $borrowDate.AddDays(14)  # 14-day borrowing period
        
        # Create transaction in correct format
        $transaction = @{
            userId = $student._id
            items = @(
                @{
                    copyId = $availableCopy.copyId
                }
            )
            type = "regular"
            notes = "Sample transaction created for testing"
        } | ConvertTo-Json -Depth 10
        
        $response = Invoke-WebRequest -Uri "$baseUrl/transactions/borrow" `
            -Method POST `
            -Headers $headers `
            -Body $transaction `
            -ErrorAction Stop
        
        $transactionsCreated++
        
        # Determine status color
        $statusColor = "Green"
        if ($scenario.Type -eq "[O]") { $statusColor = "Red" }
        elseif ($scenario.Type -eq "[D]") { $statusColor = "Yellow" }
        
        Write-Host "  $($scenario.Type) Created: " -NoNewline -ForegroundColor $statusColor
        Write-Host "$($student.firstName) $($student.lastName) borrowed '$($book.title)'" -ForegroundColor White
        Write-Host "      Borrowed: $($borrowDate.ToString('yyyy-MM-dd')) | Due: $($dueDate.ToString('yyyy-MM-dd'))" -ForegroundColor Gray
        
    } catch {
        $transactionsFailed++
        Write-Host "  Failed: $($scenario.Description) - $($_.Exception.Message)" -ForegroundColor Red
    }
    
    Start-Sleep -Milliseconds 200
}

# Get updated statistics
Write-Host "`nFetching updated dashboard statistics..." -ForegroundColor Yellow

try {
    $statsResponse = Invoke-WebRequest -Uri "$baseUrl/reports/stats" -Headers $headers -ErrorAction Stop
    $stats = ($statsResponse.Content | ConvertFrom-Json)
    
    Write-Host "`n=== DASHBOARD STATISTICS ===" -ForegroundColor Cyan
    Write-Host "Total Books: $($stats.totalBooks)" -ForegroundColor White
    Write-Host "Borrowed Books: $($stats.borrowedBooks)" -ForegroundColor White
    Write-Host "Available Books: $($stats.totalBooks - $stats.borrowedBooks)" -ForegroundColor White
    Write-Host "Overdue Books: $($stats.overdueBooks)" -ForegroundColor $(if($stats.overdueBooks -gt 0){"Red"}else{"Green"})
    Write-Host "Total Students: $($stats.newStudents)" -ForegroundColor White
    Write-Host "Total Transactions: $($stats.totalTransactions)" -ForegroundColor White
    Write-Host ""
} catch {
    Write-Host "Failed to retrieve stats" -ForegroundColor Red
}

# Get recent transactions
Write-Host "Recent Transactions Summary:" -ForegroundColor Yellow

try {
    $recentResponse = Invoke-WebRequest -Uri "$baseUrl/reports/transactions/recent" -Headers $headers -ErrorAction Stop
    $recentTransactions = ($recentResponse.Content | ConvertFrom-Json)
    
    if ($recentTransactions.Count -gt 0) {
        foreach ($trans in $recentTransactions | Select-Object -First 5) {
            Write-Host "  $($trans.type): $($trans.studentName) - $($trans.bookTitle)" -ForegroundColor Gray
        }
    } else {
        Write-Host "  No recent transactions found" -ForegroundColor Gray
    }
    Write-Host ""
} catch {
    Write-Host "  Could not fetch recent transactions" -ForegroundColor Yellow
}

# Get overdue books
Write-Host "Overdue Books:" -ForegroundColor Yellow

try {
    $overdueResponse = Invoke-WebRequest -Uri "$baseUrl/reports/overdue/recent" -Headers $headers -ErrorAction Stop
    $overdueBooks = ($overdueResponse.Content | ConvertFrom-Json)
    
    if ($overdueBooks.Count -gt 0) {
        foreach ($overdue in $overdueBooks) {
            $daysOverdue = [math]::Floor(((Get-Date) - [DateTime]::Parse($overdue.dueDate)).TotalDays)
            Write-Host "  $($overdue.studentName) - '$($overdue.bookTitle)' (Overdue by $daysOverdue days)" -ForegroundColor Red
        }
    } else {
        Write-Host "  No overdue books" -ForegroundColor Green
    }
    Write-Host ""
} catch {
    Write-Host "  Could not fetch overdue books" -ForegroundColor Yellow
}

# Summary
Write-Host "`n=== TRANSACTION CREATION SUMMARY ===" -ForegroundColor Cyan
Write-Host "Transactions Created: $transactionsCreated" -ForegroundColor Green
Write-Host "Transactions Failed: $transactionsFailed" -ForegroundColor $(if($transactionsFailed -gt 0){"Red"}else{"Green"})

Write-Host "`nTransaction Distribution:" -ForegroundColor Yellow
Write-Host "  Recent Borrows (0-5 days ago): " -NoNewline -ForegroundColor Gray
Write-Host ($scenarios | Where-Object {$_.DaysAgo -le 5}).Count -ForegroundColor Green
Write-Host "  Due Soon (6-13 days ago): " -NoNewline -ForegroundColor Gray
Write-Host ($scenarios | Where-Object {$_.DaysAgo -gt 5 -and $_.DaysAgo -le 13}).Count -ForegroundColor Yellow
Write-Host "  Overdue (14+ days ago): " -NoNewline -ForegroundColor Gray
Write-Host ($scenarios | Where-Object {$_.DaysAgo -gt 14}).Count -ForegroundColor Red

Write-Host "`nSample transactions created successfully!" -ForegroundColor Green
Write-Host "You can now test:" -ForegroundColor Cyan
Write-Host "  - Dashboard with real transaction data" -ForegroundColor White
Write-Host "  - Overdue books tracking" -ForegroundColor White
Write-Host "  - Return transactions" -ForegroundColor White
Write-Host "  - Fine calculations" -ForegroundColor White
Write-Host "  - Transaction reports and analytics`n" -ForegroundColor White
