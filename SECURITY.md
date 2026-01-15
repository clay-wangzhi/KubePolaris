# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

We take the security of KubePolaris seriously. If you believe you have found a security vulnerability, please report it to us as described below.

### Please do NOT:

- Open a public GitHub issue for security vulnerabilities
- Disclose the vulnerability publicly before it has been addressed

### Please DO:

1. **Email us directly** at: **security@kubepolaris.io**

2. **Include the following information**:
   - Type of vulnerability (e.g., SQL injection, XSS, authentication bypass)
   - Full paths of source file(s) related to the vulnerability
   - Location of the affected source code (tag/branch/commit or direct URL)
   - Step-by-step instructions to reproduce the issue
   - Proof-of-concept or exploit code (if possible)
   - Impact of the issue, including how an attacker might exploit it

3. **Use encryption** if possible:
   - PGP Key: Available upon request

### What to expect:

- **Acknowledgment**: We will acknowledge receipt of your report within 48 hours
- **Communication**: We will keep you informed of the progress towards a fix
- **Credit**: We will credit you in the release notes (unless you prefer to remain anonymous)
- **Timeline**: We aim to address critical vulnerabilities within 7 days

## Security Best Practices

When deploying KubePolaris, please follow these security best practices:

### Authentication
- Change default passwords immediately after installation
- Use strong, unique passwords (minimum 12 characters)
- Enable MFA where possible
- Use LDAP/OIDC for enterprise deployments

### Network Security
- Always use HTTPS in production
- Configure proper firewall rules
- Use network policies in Kubernetes
- Limit API server access

### Access Control
- Follow the principle of least privilege
- Regularly review user permissions
- Remove unused accounts promptly
- Use separate accounts for different environments

### Data Protection
- Encrypt sensitive data at rest
- Use encrypted connections to databases
- Regularly backup data
- Secure backup storage

### Monitoring
- Enable audit logging
- Monitor for suspicious activities
- Set up alerts for security events
- Regularly review logs

## Security Updates

Security updates will be released as patch versions (e.g., 1.0.1) and announced through:

- GitHub Security Advisories
- Release notes
- Our mailing list (subscribe at http://kubepolaris.clay-wangzhi.com/)

## Bug Bounty

Currently, we do not have a formal bug bounty program. However, we greatly appreciate security researchers who responsibly disclose vulnerabilities and will acknowledge their contributions.

## Contact

- Security issues: security@kubepolaris.io
- General questions: hello@kubepolaris.io
- GitHub: https://github.com/clay-wangzhi/KubePolaris

