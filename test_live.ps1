$d = Invoke-RestMethod -Uri "https://admin.olympiafitnessmadurai.com/api/dashboard/stats?startDate=2026-09-01&endDate=2026-09-30"
$s = Invoke-RestMethod -Uri "https://admin.olympiafitnessmadurai.com/api/stats"

Write-Output "--- LIVE STATS VERIFICATION ---"
Write-Output "Dashboard rangeRevenue: $($d.rangeRevenue)"
Write-Output "Dashboard rangeExpenses: $($d.rangeExpenses)"
Write-Output "Monthly Collection: $($s.monthlyCollection)"
Write-Output "Monthly Expenses: $($s.monthlyExpenses)"
