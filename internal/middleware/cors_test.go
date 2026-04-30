package middleware

import "testing"

func TestOriginAllowedForRequestAllowsSameHostWithoutWhitelist(t *testing.T) {
	allowed := isOriginAllowedForRequest("http://10.70.40.53:8080", "10.70.40.53:8080", nil)
	if !allowed {
		t.Fatal("expected same host origin to be allowed without whitelist")
	}
}

func TestOriginAllowedForRequestRejectsDifferentHostWithoutWhitelist(t *testing.T) {
	allowed := isOriginAllowedForRequest("http://evil.example.com", "10.70.40.53:8080", nil)
	if allowed {
		t.Fatal("expected different host origin to be rejected without whitelist")
	}
}

func TestOriginAllowedForRequestUsesWhitelistWhenConfigured(t *testing.T) {
	allowedOrigins := []string{"http://app.example.com"}

	if !isOriginAllowedForRequest("http://app.example.com", "10.70.40.53:8080", allowedOrigins) {
		t.Fatal("expected whitelisted origin to be allowed")
	}
	if isOriginAllowedForRequest("http://10.70.40.53:8080", "10.70.40.53:8080", allowedOrigins) {
		t.Fatal("expected same host origin to be rejected when whitelist is configured")
	}
}
