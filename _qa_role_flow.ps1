$ErrorActionPreference = 'Continue'
$BASE = 'http://localhost:8000/api'
$script:RESULTS = @()

function Rec([string]$role, [string]$step, [bool]$ok, [string]$detail) {
  $script:RESULTS += [pscustomobject]@{ role = $role; step = $step; ok = $ok; detail = $detail }
  $flag = if ($ok) { 'PASS' } else { 'FAIL' }
  Write-Host "[$flag] $($role.PadRight(12)) ${step}: $detail"
}

function ApiCall([string]$method, [string]$path, [string]$token, $body) {
  $headers = @{ 'Content-Type' = 'application/json' }
  if ($token) { $headers['Authorization'] = "Bearer $token" }
  $uri = "$BASE$path"
  try {
    $params = @{ Uri = $uri; Method = $method; Headers = $headers }
    if ($null -ne $body) { $params.Body = ($body | ConvertTo-Json -Depth 12 -Compress) }
    $resp = Invoke-RestMethod @params
    return @{ code = 200; data = $resp; err = '' }
  } catch {
    $ex = $_.Exception
    $code = 0
    $err = $ex.Message
    if ($ex.Response) {
      try { $code = [int]$ex.Response.StatusCode } catch {}
      try {
        $reader = New-Object System.IO.StreamReader($ex.Response.GetResponseStream())
        $err = $reader.ReadToEnd()
      } catch {}
    }
    return @{ code = $code; data = $null; err = $err }
  }
}

function DoLogin([string]$email, [string]$pw) {
  $r = ApiCall POST '/auth/login' $null @{ email = $email; password = $pw }
  if ($r.code -eq 200 -and $r.data.access_token) {
    return @{ token = $r.data.access_token; user = $r.data.user }
  }
  return @{ token = $null; user = $null; err = "$($r.code) $($r.err)" }
}

$admin = DoLogin 'admin@radio.com' 'radio@1'
Rec 'SUPER_ADMIN' 'Login' ([bool]$admin.token) $(if ($admin.token) { $admin.user.name } else { $admin.err })
if (-not $admin.token) { throw 'Admin login failed' }

$mgr = DoLogin 'manager@radio.com' 'manager@123'
Rec 'MANAGER' 'Login' ([bool]$mgr.token) $(if ($mgr.token) { $mgr.user.name } else { $mgr.err })

$centerEmail = 'qa.center@radionet.test'
$centerPw = 'QaCenter!2026'
$cr = ApiCall POST '/centers' $admin.token @{
  id = 'center-qa-flow-001'
  centerName = 'QA Flow Diagnostic Center'
  firstName = 'QA'; lastName = 'Center'
  email = $centerEmail; username = $centerEmail; password = $centerPw
  contactNumber = '9000000001'; address = 'QA Lab, Test City'
}
Rec 'SUPER_ADMIN' 'Create test center' ($cr.code -eq 200) "$($cr.code) $(if ($cr.data) { $cr.data.id } else { $cr.err.Substring(0, [Math]::Min(180,$cr.err.Length)) })"
$center = $cr.data

$docEmail = 'qa.doctor@radionet.test'
$docPw = 'QaDoctor!2026'
$dr = ApiCall POST '/doctors' $admin.token @{
  id = 'doc-qa-flow-001'
  firstName = 'QA'; lastName = 'Radiologist'; fullName = 'DR. QA RADIOLOGIST'
  email = $docEmail; username = $docEmail; password = $docPw
  contactNumber = '9000000002'; address = 'QA Reading Room'
  degree = 'M.D. (Radiodiagnosis)'; registrationNumber = 'QA-REG-001'
}
Rec 'SUPER_ADMIN' 'Create test doctor' ($dr.code -eq 200) "$($dr.code) $(if ($dr.data) { $dr.data.id } else { $dr.err.Substring(0, [Math]::Min(180,$dr.err.Length)) })"

$ctr = DoLogin $centerEmail $centerPw
Rec 'CENTER' 'Login (created account)' ([bool]$ctr.token) $(if ($ctr.token) { "name=$($ctr.user.name) centerId=$($ctr.user.centerId)" } else { $ctr.err })

$doc = DoLogin $docEmail $docPw
Rec 'DOCTOR' 'Login (created account)' ([bool]$doc.token) $(if ($doc.token) { "name=$($doc.user.name) doctorId=$($doc.user.doctorId)" } else { $doc.err })

$adminGets = @(
  @{ n = 'List doctors'; p = '/doctors' },
  @{ n = 'List centers'; p = '/centers' },
  @{ n = 'List reports'; p = '/reports' },
  @{ n = 'List approvals'; p = '/approvals' },
  @{ n = 'Center invoices'; p = '/invoices?partyType=center' },
  @{ n = 'Doctor invoices'; p = '/invoices?partyType=doctor' },
  @{ n = 'Pricing'; p = '/billing/pricing' },
  @{ n = 'Billing periods'; p = '/billing/periods' },
  @{ n = 'Templates'; p = '/templates' },
  @{ n = 'Users'; p = '/auth/users' }
)
foreach ($g in $adminGets) {
  $r = ApiCall GET $g.p $admin.token $null
  $n = if ($r.data -is [array]) { $r.data.Count } elseif ($r.data) { 'obj' } else { 0 }
  Rec 'SUPER_ADMIN' $g.n ($r.code -eq 200) $(if ($r.code -eq 200) { "$($r.code) n=$n" } else { "$($r.code) $($r.err)" })
}

if ($mgr.token) {
  foreach ($g in @('/reports','/doctors','/centers',"/approvals?managerId=$($mgr.user.email)",'/invoices?partyType=center')) {
    $r = ApiCall GET $g $mgr.token $null
    Rec 'MANAGER' "GET $g" ($r.code -ge 200 -and $r.code -lt 500) "$($r.code)"
  }
  $ap = ApiCall POST '/approvals/submit' $mgr.token @{
    managerId = $mgr.user.email; managerName = $mgr.user.name
    actionType = 'CREATE_DOCTOR'; entityType = 'doctor'
    payload = @{
      firstName = 'QA'; lastName = 'PendingDoc'; fullName = 'DR. QA PENDINGDOC'
      email = 'qa.pendingdoc@radionet.test'; username = 'qa.pendingdoc@radionet.test'
      password = 'QaPending!2026'; contactNumber = '9000000003'
    }
  }
  Rec 'MANAGER' 'Submit CREATE_DOCTOR approval' ($ap.code -eq 200) "$($ap.code) id=$(if ($ap.data) { $ap.data.id } else { $ap.err })"
  if ($ap.data.id) {
    $self = ApiCall POST "/approvals/$($ap.data.id)/approve" $mgr.token @{ reviewerName = 'Manager' }
    Rec 'MANAGER' 'Self-approve (must fail)' ($self.code -in 401,403) "$($self.code) $($self.err)"
    $ok = ApiCall POST "/approvals/$($ap.data.id)/approve" $admin.token @{ reviewerName = 'Super Admin' }
    Rec 'SUPER_ADMIN' 'Approve manager CREATE_DOCTOR' ($ok.code -eq 200) "$($ok.code) status=$(if ($ok.data) { $ok.data.status } else { $ok.err })"
    $pend = DoLogin 'qa.pendingdoc@radionet.test' 'QaPending!2026'
    Rec 'DOCTOR' 'Login after approval-created account' ([bool]$pend.token) $(if ($pend.token) { "doctorId=$($pend.user.doctorId)" } else { $pend.err })
  }
}

$caseId = $null
$caseTemplate = $null
if ($ctr.token -and $center) {
  $today = (Get-Date).ToString('yyyy-MM-dd')
  $caseTemplate = @{
    patientNumber = 'QA-FLOW-001'; fullName = 'QA Test Patient'; age = 9; ageUnit = 'Months'; gender = 'Female'
    phone = '9000000099'
    radiologyCenterId = $center.id; radiologyCenterName = $center.centerName
    bodyParts = @('CHEST PA/AP','KNEE JOINT AP/LAT')
    referringPhysicianId = 'ref-qa'; referringPhysicianName = 'DR. REFERRING QA'
    status = 'Pending'; studyDate = $today
    clinicalNotes = 'Cough 3 days. Rule out pneumonia. Infant 9 months.'
    modality = 'X-Ray'; isUrgent = $true; isPortable = $true; claimStatus = 'UNCLAIMED'; uploadedImages = @()
  }
  $created = ApiCall POST '/reports' $ctr.token $caseTemplate
  Rec 'CENTER' 'Create STAT portable 2-study infant case' ($created.code -eq 200) "$($created.code) id=$(if ($created.data) { $created.data.id } else { $created.err })"
  if ($created.data) {
    $caseId = $created.data.id
    $stCount = @($created.data.studies).Count
    Rec 'CENTER' 'Case identity fields returned' $true "age=$($created.data.age) ageUnit=$($created.data.ageUnit) gender=$($created.data.gender) urgent=$($created.data.isUrgent) portable=$($created.data.isPortable) studies=$stCount"
  }
  $inv = ApiCall GET '/invoices?partyType=center' $ctr.token $null
  Rec 'CENTER' 'Own invoices' ($inv.code -eq 200) "$($inv.code)"
  $mw = ApiCall GET '/reports/my-work' $ctr.token $null
  Rec 'CENTER' 'My Work (must be doctor-only)' ($mw.code -in 401,403) "$($mw.code)"
}

if ($doc.token -and $caseId) {
  $all = ApiCall GET '/reports' $doc.token $null
  $n = if ($all.data -is [array]) { $all.data.Count } else { 0 }
  Rec 'DOCTOR' 'List all reports (unscoped?)' ($all.code -eq 200) "$($all.code) n=$n"
  $found = $false
  if ($all.data) { $found = [bool]($all.data | Where-Object { $_.id -eq $caseId }) }
  Rec 'DOCTOR' 'QA case visible in global list' $found "found=$found"

  $claim = ApiCall POST "/reports/$caseId/claim" $doc.token @{ doctorId = $doc.user.email; doctorName = $doc.user.name }
  Rec 'DOCTOR' 'Claim via email (Live Feed path)' ($claim.code -in 200,409) "$($claim.code) claimedBy=$(if ($claim.data) { $claim.data.claimedByDoctorId } else { $claim.err })"

  if ($claim.code -eq 409 -and $ctr.token -and $caseTemplate) {
    $p2 = $caseTemplate.Clone()
    $p2.patientNumber = 'QA-FLOW-002'; $p2.fullName = 'QA Second Patient'; $p2.isUrgent = $false
    $c2 = ApiCall POST '/reports' $ctr.token $p2
    Rec 'CENTER' 'Create second routine case' ($c2.code -eq 200) "$($c2.code) $($c2.data.id)"
    if ($c2.data) {
      $caseId = $c2.data.id
      $claim = ApiCall POST "/reports/$caseId/claim" $doc.token @{ doctorId = $doc.user.email; doctorName = $doc.user.name }
      Rec 'DOCTOR' 'Claim case-2 via email' ($claim.code -eq 200) "$($claim.code) claimedBy=$(if ($claim.data) { $claim.data.claimedByDoctorId } else { $claim.err })"
    }
  }

  $mw = ApiCall GET '/reports/my-work' $doc.token $null
  Rec 'DOCTOR' 'My Work after email-claim' ($mw.code -eq 200) "$($mw.code) total=$(if ($mw.data) { $mw.data.total } else { $mw.err })"
  $inMw = $false
  if ($mw.data) {
    $items = @()
    if ($mw.data.items) { $items = @($mw.data.items) }
    elseif ($mw.data.reports) { $items = @($mw.data.reports) }
    $inMw = [bool]($items | Where-Object { $_.id -eq $caseId })
  }
  Rec 'DOCTOR' 'Email-claimed case in My Work' $inMw "in_mywork=$inMw"

  $claimedBy = $claim.data.claimedByDoctorId
  $wouldHide = ($claimedBy -and $doc.user.doctorId -and ($claimedBy -ne $doc.user.doctorId))
  Rec 'DOCTOR' 'All Reports would hide own email-claim' $true "claimedBy=$claimedBy doctorId=$($doc.user.doctorId) hide=$wouldHide"

  $det = ApiCall GET "/reports/$caseId" $doc.token $null
  $studies = @()
  if ($det.data.studies) { $studies = @($det.data.studies) }
  Rec 'DOCTOR' 'Open workspace case' ($det.code -eq 200) "$($det.code) studies=$($studies.Count) ageUnit=$($det.data.ageUnit)"

  if ($studies.Count -gt 0) {
    $sid = $studies[0].id
    $draft = ApiCall POST "/reports/$caseId/studies/$sid/draft" $doc.token @{ findings = 'Draft findings QA'; impression = 'Draft impression QA' }
    Rec 'DOCTOR' 'Save draft (API; UI has no button)' ($draft.code -eq 200) "$($draft.code) $($draft.err)"
    $sg = ApiCall POST "/reports/$caseId/studies/$sid/sign" $doc.token @{
      findings = 'Infant chest: clear lungs. No consolidation.'; impression = 'No active lung lesion.'; technique = 'Portable AP chest'
    }
    Rec 'DOCTOR' 'Sign study 1 of 2' ($sg.code -eq 200) "$($sg.code) complete=$($sg.data.caseComplete) signed=$($sg.data.signedStudyCount) $($sg.err)"
    $part = ApiCall GET '/reports/my-partial-cases' $doc.token $null
    Rec 'DOCTOR' 'Partial cases after 1/2 signed' ($part.code -eq 200) "$($part.code) total=$($part.data.total)"
    if ($studies.Count -gt 1) {
      $sid2 = $studies[1].id
      $sg2 = ApiCall POST "/reports/$caseId/studies/$sid2/sign" $doc.token @{
        findings = 'Knee: alignment preserved. No fracture.'; impression = 'No acute bony injury.'
      }
      Rec 'DOCTOR' 'Sign study 2 of 2 (complete case)' ($sg2.code -eq 200) "$($sg2.code) complete=$($sg2.data.caseComplete) billing=$([bool]$sg2.data.billing) $($sg2.err)"
    }
  }

  if ($ctr.token -and $center) {
    $dec = ApiCall POST '/reports' $ctr.token @{
      patientNumber = 'QA-FLOW-DECLINE'; fullName = 'QA Decline Patient'; age = 40; gender = 'Male'; phone = '9000000088'
      radiologyCenterId = $center.id; radiologyCenterName = $center.centerName
      bodyParts = @('CHEST PA/AP'); referringPhysicianId = 'ref-qa'; referringPhysicianName = 'DR. REFERRING QA'
      status = 'Pending'; studyDate = (Get-Date).ToString('yyyy-MM-dd'); modality = 'X-Ray'; isUrgent = $false; claimStatus = 'UNCLAIMED'
    }
    if ($dec.data) {
      $rej = ApiCall POST "/reports/$($dec.data.id)/reject" $doc.token @{ doctorId = 'Doctor declined study from Live Feed'; doctorName = $doc.user.name }
      Rec 'DOCTOR' 'Decline with reason-as-doctorId (Live Feed bug)' $true "$($rej.code) $($rej.err)"
    }
  }

  $earn = ApiCall GET '/invoices?partyType=doctor' $doc.token $null
  Rec 'DOCTOR' 'Earnings invoices' ($earn.code -eq 200) "$($earn.code) n=$(if ($earn.data -is [array]) { $earn.data.Count } else { $earn.err })"

  $rc = ApiCall POST "/reports/$caseId/recheck" $doc.token @{ reason = 'QA recheck' }
  Rec 'DOCTOR' 'Recheck completed case' ($rc.code -in 200,400,403,404) "$($rc.code) $($rc.err)"
  $cm = ApiCall POST "/reports/$caseId/comments" $doc.token @{ body = 'QA comment from doctor' }
  Rec 'DOCTOR' 'Add case comment' ($cm.code -in 200,201,400,403,404,422) "$($cm.code) $($cm.err)"
}

if ($doc.token) {
  $inv = ApiCall GET '/invoices' $doc.token $null
  Rec 'DOCTOR' 'Unscoped /invoices' $true "$($inv.code)"
}

if ($ctr.token -and $center) {
  $reps = ApiCall GET '/reports' $ctr.token $null
  $other = 0; $total = 0
  if ($reps.data -is [array]) {
    $total = $reps.data.Count
    $other = @($reps.data | Where-Object { $_.radiologyCenterId -ne $center.id -and $_.radiologyCenterId -ne $ctr.user.centerId }).Count
  }
  Rec 'CENTER' "Sees other centers' cases in GET /reports" $true "total=$total other_center=$other"
}

if ($admin.token -and $caseId) {
  $d = ApiCall GET "/reports/$caseId" $admin.token $null
  Rec 'SUPER_ADMIN' 'Open QA case after doctor work' ($d.code -eq 200) "status=$($d.data.status) claim=$($d.data.claimStatus) signed=$($d.data.signedStudyCount)"
}

$out = [pscustomobject]@{
  credentials = @{
    super_admin = @{ email = 'admin@radio.com'; password = 'radio@1' }
    manager = @{ email = 'manager@radio.com'; password = 'manager@123' }
    qa_doctor = @{ email = $docEmail; password = $docPw; doctorId = $doc.user.doctorId }
    qa_center = @{ email = $centerEmail; password = $centerPw; centerId = $ctr.user.centerId }
    qa_pending_doctor = @{ email = 'qa.pendingdoc@radionet.test'; password = 'QaPending!2026' }
  }
  results = $script:RESULTS
  passed = @($script:RESULTS | Where-Object { $_.ok }).Count
  failed = @($script:RESULTS | Where-Object { -not $_.ok }).Count
  total = $script:RESULTS.Count
}
$out | ConvertTo-Json -Depth 8 | Set-Content -Path 'qa_role_flow_results.json' -Encoding utf8
Write-Host "`nDONE $($out.passed)/$($out.total) ok, $($out.failed) fail"
