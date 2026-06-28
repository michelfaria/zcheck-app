export const metadata = {
  title: 'Política de Privacidade — ZCheck',
};

const C = { ink: '#063C5C', bg: '#F7F9FB', border: '#E2EAF0', muted: '#6B8299' };

const Section = ({ title, children }) => (
  <div style={{ marginBottom: 32 }}>
    <h2 style={{ fontSize: 18, fontWeight: 800, color: C.ink, marginBottom: 12, borderBottom: `2px solid ${C.border}`, paddingBottom: 8 }}>{title}</h2>
    {children}
  </div>
);

const Sub = ({ title, children }) => (
  <div style={{ marginBottom: 16 }}>
    <h3 style={{ fontSize: 15, fontWeight: 700, color: '#2F6F5E', marginBottom: 8 }}>{title}</h3>
    {children}
  </div>
);

const P = ({ children }) => (
  <p style={{ fontSize: 14, color: '#333', lineHeight: 1.8, marginBottom: 12, textAlign: 'justify' }}>{children}</p>
);

const Li = ({ children }) => (
  <li style={{ fontSize: 14, color: '#333', lineHeight: 1.8, marginBottom: 6 }}>{children}</li>
);

export default function PrivacidadePage() {
  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px 80px' }}>

        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: C.ink, marginBottom: 8 }}>Política de Privacidade</h1>
          <p style={{ fontSize: 14, color: C.muted }}>ZCheck — Versão 1.0 — 25 de junho de 2026</p>
          <div style={{ display: 'inline-block', background: '#E8F4F0', borderRadius: 8, padding: '8px 16px', marginTop: 12 }}>
            <p style={{ fontSize: 13, color: '#2F6F5E', fontWeight: 700, margin: 0 }}>Conforme Lei nº 13.709/2018 (LGPD)</p>
          </div>
        </div>

        <Section title="1. Controlador dos Dados">
          <P><strong>INGO Administração de Negócios Ltda — CNPJ 34.164.735/0001-72</strong></P>
          <P>CNPJ: </P>
          <P>Endereço: São Paulo, Estado de São Paulo, Brasil</P>
          <P>E-mail do Encarregado de Dados (DPO): ingonegocios@gmail.com</P>
        </Section>

        <Section title="2. Base Legal (LGPD)">
          <P>O tratamento de dados pessoais fundamenta-se nas seguintes bases legais previstas no art. 7º da Lei nº 13.709/2018:</P>
          <ul style={{ paddingLeft: 24, marginBottom: 12 }}>
            <Li>Art. 7º, II — Cumprimento de obrigação legal ou regulatória;</Li>
            <Li>Art. 7º, V — Execução de contrato ou procedimentos preliminares (relação de trabalho);</Li>
            <Li>Art. 7º, IX — Legítimo interesse do controlador, para fins de gestão operacional interna.</Li>
          </ul>
        </Section>

        <Section title="3. Dados Coletados">
          <Sub title="3.1. Dados de Cadastro">
            <ul style={{ paddingLeft: 24, marginBottom: 12 }}>
              <Li>Nome completo;</Li>
              <Li>CPF (Cadastro de Pessoas Físicas);</Li>
              <Li>Número de telefone (WhatsApp);</Li>
              <Li>Endereço de e-mail;</Li>
              <Li>Fotografia tipo selfie (para confirmação de identidade).</Li>
            </ul>
          </Sub>
          <Sub title="3.2. Dados Operacionais">
            <ul style={{ paddingLeft: 24, marginBottom: 12 }}>
              <Li>Registros de checklists executados (data, hora, itens, responsável);</Li>
              <Li>Fotografias de tarefas operacionais vinculadas a checklists;</Li>
              <Li>Indicadores de desempenho por colaborador e setor;</Li>
              <Li>Logs de acesso (data, hora e identificador do usuário).</Li>
            </ul>
          </Sub>
          <Sub title="3.3. Dados de Segurança">
            <ul style={{ paddingLeft: 24, marginBottom: 12 }}>
              <Li>Tentativas de login (com ou sem sucesso), sem armazenamento de senhas;</Li>
              <Li>Tokens de verificação Cloudflare Turnstile (anti-bot), processados externamente.</Li>
            </ul>
          </Sub>
        </Section>

        <Section title="4. Finalidade do Tratamento">
          <ul style={{ paddingLeft: 24, marginBottom: 12 }}>
            <Li>Autenticação e controle de acesso ao Aplicativo;</Li>
            <Li>Gestão operacional das unidades da empresa (checklists, relatórios, indicadores);</Li>
            <Li>Cumprimento de obrigações trabalhistas e legais;</Li>
            <Li>Prevenção a fraudes e acessos não autorizados;</Li>
            <Li>Comunicação com colaboradores sobre aprovação de cadastro e uso do Aplicativo.</Li>
          </ul>
          <P>Os dados não são utilizados para fins de marketing, publicidade ou compartilhados com terceiros para fins comerciais.</P>
        </Section>

        <Section title="5. Compartilhamento de Dados">
          <ul style={{ paddingLeft: 24, marginBottom: 12 }}>
            <Li><strong>Supabase Inc. (EUA)</strong> — banco de dados e armazenamento em nuvem, sob adequado nível de proteção contratual;</Li>
            <Li><strong>Cloudflare Inc. (EUA)</strong> — proteção anti-bot, sem armazenamento de dados pessoais identificáveis;</Li>
            <Li><strong>Vercel Inc. (EUA)</strong> — hospedagem do Aplicativo;</Li>
            <Li>Autoridades públicas, quando exigido por lei ou ordem judicial.</Li>
          </ul>
          <P>As transferências internacionais são realizadas com base no art. 33, II e IX da LGPD, mediante garantias contratuais adequadas.</P>
        </Section>

        <Section title="6. Prazo de Retenção">
          <ul style={{ paddingLeft: 24, marginBottom: 12 }}>
            <Li><strong>Dados de cadastro</strong> (nome, CPF, contato, selfie): período do vínculo empregatício + 5 anos;</Li>
            <Li><strong>Fotos de checklists</strong>: 90 dias — excluídas automaticamente após esse prazo;</Li>
            <Li><strong>Registros textuais operacionais</strong>: até 2 anos para fins de auditoria;</Li>
            <Li><strong>Logs de tentativas de login</strong>: 1 hora após o registro;</Li>
            <Li><strong>Após encerramento do vínculo</strong>: dados anonimizados ou excluídos em até 90 dias, salvo obrigação legal.</Li>
          </ul>
        </Section>

        <Section title="7. Direitos do Titular (art. 18 LGPD)">
          <ul style={{ paddingLeft: 24, marginBottom: 12 }}>
            <Li>Confirmação da existência de tratamento;</Li>
            <Li>Acesso aos dados;</Li>
            <Li>Correção de dados incompletos, inexatos ou desatualizados;</Li>
            <Li>Anonimização, bloqueio ou eliminação de dados desnecessários;</Li>
            <Li>Portabilidade dos dados;</Li>
            <Li>Eliminação dos dados tratados com base no consentimento;</Li>
            <Li>Informação sobre compartilhamento com terceiros;</Li>
            <Li>Revogação do consentimento, quando aplicável.</Li>
          </ul>
          <P>Para exercer seus direitos, envie solicitação ao DPO: <strong>ingonegocios@gmail.com</strong>. Respondemos em até 15 dias úteis.</P>
        </Section>

        <Section title="8. Segurança dos Dados">
          <ul style={{ paddingLeft: 24, marginBottom: 12 }}>
            <Li>Transmissão via protocolo HTTPS/TLS;</Li>
            <Li>Armazenamento com criptografia em repouso;</Li>
            <Li>Controle de acesso por funções (RBAC) com PIN;</Li>
            <Li>Bloqueio após 5 tentativas de login incorretas em 10 minutos;</Li>
            <Li>Exclusão automática de fotos após 90 dias.</Li>
          </ul>
          <P>Em caso de incidente de segurança, a Empresa comunicará a ANPD e os titulares afetados no prazo previsto em lei.</P>
        </Section>

        <Section title="9. Cookies e Tecnologias Similares">
          <P>O Aplicativo utiliza armazenamento local (IndexedDB) exclusivamente para funcionamento offline. Não utilizamos cookies de rastreamento ou publicidade.</P>
          <P>O Cloudflare Turnstile analisa comportamento para distinguir humanos de bots, sem armazenamento de dados pessoais pelo IBR.</P>
        </Section>

        <Section title="10. Contato — Encarregado de Dados (DPO)">
          <P><strong>INGO Administração de Negócios Ltda — CNPJ 34.164.735/0001-72</strong></P>
          <P>CNPJ:  | São Paulo, SP</P>
          <P>E-mail: ingonegocios@gmail.com</P>
        </Section>

        <Section title="11. Alterações desta Política">
          <P>Esta Política poderá ser atualizada periodicamente. Alterações relevantes serão comunicadas pelo Aplicativo. O uso continuado implica aceitação da nova versão.</P>
        </Section>

        <Section title="12. Lei Aplicável e Foro">
          <P>Esta Política é regida pela Lei nº 13.709/2018 (LGPD), pela Lei nº 12.965/2014 (Marco Civil da Internet) e demais normas brasileiras aplicáveis. Foro eleito: Comarca de São Paulo, Estado de São Paulo.</P>
        </Section>

        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 24, marginTop: 48, textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: C.muted }}>INGO Administração de Negócios Ltda — CNPJ 34.164.735/0001-72</p>
          <p style={{ fontSize: 13, color: C.muted }}>ingonegocios@gmail.com</p>
          <div style={{ marginTop: 16 }}>
            <a href="/termos" style={{ fontSize: 13, color: C.ink, textDecoration: 'underline', marginRight: 16 }}>Termos de Uso</a>
            <a href="/cadastro" style={{ fontSize: 13, color: C.ink, textDecoration: 'underline' }}>Página de Cadastro</a>
          </div>
        </div>
      </div>
    </div>
  );
}
