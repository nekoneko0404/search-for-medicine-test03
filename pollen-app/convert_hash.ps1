$hex = 'F6785CCF152A2BCEDB70A1E1DB47D241C4C60F8AAAE4685AC8D612616AB006420D06139F40B83F3F91C6E65175BAB9F8'
$bytes = for($i=0; $i -lt $hex.Length; $i+=2){ [Convert]::ToByte($hex.Substring($i, 2), 16) }
$base64 = [Convert]::ToBase64String($bytes)
Write-Output "sha384-$base64"
