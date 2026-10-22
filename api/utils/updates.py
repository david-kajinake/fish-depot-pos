from django.core.mail import EmailMultiAlternatives
from django.utils.html import escape


class Update:

    def notify_multiple_invalid_login_attempts(self, contact_to_notify, client_ip, attempts):
            """Email an administrator about a batch of 3 consecutive failed login attempts."""
            subject = 'Fresh Victoria Fish: Suspicious login pattern detected'
            
            # Build plain text fallback body
            text_lines = [
                f'Three consecutive invalid login attempts were detected from IP: {client_ip}\n',
                'Attempted Credentials:'
            ]
            for i, att in enumerate(attempts, 1):
                text_lines.append(f"{i}. Username: {att['username']} | Password: {att['password']}")
            text_body = '\n'.join(text_lines)

            # Build rich HTML table body containing 3 entries for credentials attempted
            rows_html = "".join([
                f"<tr><td>{i}</td><td>{escape(att['username'])}</td><td>{escape(att['password'])}</td></tr>"
                for i, att in enumerate(attempts, 1)
            ])

            html_body = f"""
            <html><body>
                <h2>Suspicious Login Pattern Detected</h2>
                <p>Three consecutive invalid login attempts originated from client IP: <b>{escape(client_ip)}</b></p>
                <table cellpadding="6" cellspacing="0" border="1" style="border-collapse: collapse; width: 100%;">
                    <thead>
                        <tr style="background-color: #f2f2f2;">
                            <th>#</th>
                            <th>Username Tried</th>
                            <th>Password Tried</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows_html}
                    </tbody>
                </table>
                <p>Please review these credentials and update affected accounts if necessary.</p>
            </body></html>
            """

            message = EmailMultiAlternatives(subject, text_body, to=[contact_to_notify])
            message.attach_alternative(html_body, 'text/html')
            message.send(fail_silently=False)
            return f"Batch invalid-login alert emailed to {contact_to_notify}"



