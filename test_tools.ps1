$S = Read-Host "Vapi secret"
$U = "http://localhost:5678/webhook/vapi"
$H = @{ "x-vapi-secret" = $S }

function Call($path, $id, $name, $toolArgs) {
  $body = @{ message = @{ toolCallList = @( @{ id = $id; function = @{ name = $name; arguments = $toolArgs } } ) } } |
          ConvertTo-Json -Depth 10 -Compress
  try {
    $r = Invoke-RestMethod -Method Post -Uri "$U/$path" -Headers $H -ContentType "application/json" -Body $body
    Write-Host "[$name] OK  toolCallId=$($r.results[0].toolCallId)" -ForegroundColor Green
    Write-Host $r.results[0].result
  } catch {
    Write-Host "[$name] FAILED: $($_.Exception.Message)" -ForegroundColor Red
  }
  Write-Host ""
}

Call "get-menu"           "t1" "get_menu"           @{}
Call "get-promotions"     "t2" "get_promotions"     @{}
Call "calculate-order"    "t3" "calculate_order"    @{ order_type = "pickup"; items = @( @{ name = "Stroopwafel"; quantity = 2 } ) }
Call "check-availability" "t4" "check_availability" @{ date = "2026-10-10"; time = "18:30"; people_count = 4 }

$yn = Read-Host "Create a TEST order and TEST booking in Supabase? (y/n)"
if ($yn -eq "y") {
  Call "create-order"   "t5" "create_order"   @{ customer_phone = "+31600000000"; order_type = "pickup"; items = @( @{ name = "Stroopwafel"; quantity = 2 } ) }
  Call "create-booking" "t6" "create_booking" @{ customer_phone = "+31600000000"; customer_name = "Test Jansen"; service = "restauranttafel"; date = "2026-10-10"; time = "18:30"; people_count = 4 }
}