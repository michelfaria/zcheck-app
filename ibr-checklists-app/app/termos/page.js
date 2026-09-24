import { C } from '../../lib/tokens';

export const metadata = {
  title: 'Termos de Uso — ZCheck',
};

const Section = ({ title, children }) => (
  <div style={{ marginBottom: 32 }}>
    <h2 style={{ fontSize: 18, fontWeight: 600, color: C.ink, marginBottom: 12, borderBottom: `2px solid ${C.border}`, paddingBottom: 8 }}>{title}</h2>
    {children}
  </div>
);

const P = ({ children }) => (
  <p style={{ fontSize: 14, color: '#333', lineHeight: 1.8, marginBottom: 12, textAlign: 'justify' }}>{children}</p>
);

const Li = ({ children }) => (
  <li style={{ fontSize: 14, color: '#333', lineHeight: 1.8, marginBottom: 6 }}>{children}</li>
);

export default function TermosPage() {
  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px 80px' }}>

        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: C.ink, marginBottom: 8 }}>Termos de Uso</h1>
          <p style={{ fontSize: 14, color: C.muted }}>ZCheck — Versão 1.2 — 23 de setembro de 2026</p>
        </div>

        <Section title="1. Das Partes e do Objeto">
          <P>Os presentes Termos de Uso regulam o acesso e a utilização do aplicativo ZCheck ("Aplicativo"), operado por INGO Administração de Negócios Ltda, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº 34.164.735/0001-72, com sede no Município de Ilhabela, Estado de São Paulo ("Empresa"), distribuidora da marca ZCheck.</P>
          <P>O Aplicativo é uma plataforma de gestão operacional interna, destinada ao controle de checklists, registros fotográficos, relatórios de desempenho e comunicação.</P>
        </Section>

        <Section title="2. Aceitação dos Termos">
          <P>O acesso ao Aplicativo implica a aceitação integral e irrestrita destes Termos de Uso. O usuário que não concordar com qualquer disposição aqui prevista deverá abster-se de utilizar o Aplicativo.</P>
          <P>Para colaboradores, a aceitação também decorre do ato de solicitação de cadastro e utilização do serviço no exercício de suas funções laborais, nos termos do art. 7º da Lei nº 13.709/2018 (LGPD).</P>
        </Section>

        <Section title="3. Cadastro e Acesso">
          <P>O acesso ao Aplicativo é restrito a usuários previamente cadastrados e aprovados pela gestão da Empresa. O processo de cadastro exige:</P>
          <ul style={{ paddingLeft: 24, marginBottom: 12 }}>
            <Li>Fornecimento de nome completo, CPF, telefone, e-mail e fotografia (selfie);</Li>
            <Li>Criação de PIN pessoal de 4 (quatro) dígitos;</Li>
            <Li>Aprovação pela gestão, que definirá o nível de acesso e o setor do usuário.</Li>
          </ul>
          <P>O acesso é pessoal e intransferível: cada usuário corresponde a uma única pessoa, e um mesmo usuário não pode ser utilizado por mais de uma pessoa.</P>
          <P>O usuário é o único responsável pela confidencialidade de seu PIN. A Empresa não se responsabiliza por acessos não autorizados decorrentes do compartilhamento ou negligência na guarda do PIN.</P>
          <P>Em caso de suspeita de uso indevido, o usuário deverá comunicar imediatamente a gestão pelo e-mail ingonegocios@gmail.com.</P>
        </Section>

        <Section title="4. Uso Permitido">
          <P>O Aplicativo destina-se exclusivamente ao uso profissional no âmbito das atividades operacionais da Empresa. São usos permitidos:</P>
          <ul style={{ paddingLeft: 24, marginBottom: 12 }}>
            <Li>Execução e registro de checklists operacionais;</Li>
            <Li>Visualização de relatórios e indicadores de desempenho;</Li>
            <Li>Registro fotográfico de tarefas que exijam comprovação;</Li>
            <Li>Comunicação operacional entre colaboradores e gestão.</Li>
          </ul>
        </Section>

        <Section title="5. Uso Proibido">
          <P>É expressamente proibido ao usuário:</P>
          <ul style={{ paddingLeft: 24, marginBottom: 12 }}>
            <Li>Compartilhar suas credenciais de acesso com terceiros ou permitir que outra pessoa utilize o seu usuário, que é pessoal e intransferível;</Li>
            <Li>Utilizar o Aplicativo para fins alheios às atividades profissionais da Empresa;</Li>
            <Li>Inserir informações falsas, incompletas ou enganosas;</Li>
            <Li>Tentar acessar, modificar ou excluir dados de outros usuários;</Li>
            <Li>Realizar engenharia reversa, descompilar ou tentar extrair o código-fonte do Aplicativo;</Li>
            <Li>Utilizar ferramentas automatizadas (bots, scripts) para interagir com o Aplicativo;</Li>
            <Li>Praticar qualquer ato que viole a legislação brasileira vigente, em especial a LGPD, o Marco Civil da Internet (Lei nº 12.965/2014) e a Lei nº 12.737/2012.</Li>
          </ul>
        </Section>

        <Section title="6. Propriedade Intelectual">
          <P>O Aplicativo, sua identidade visual, logotipos, marcas, textos, funcionalidades e código-fonte são de propriedade exclusiva de INGO Administração de Negócios Ltda, protegidos pela Lei nº 9.610/1998 (Lei de Direitos Autorais) e demais normas aplicáveis.</P>
          <P>É vedada qualquer reprodução, distribuição ou uso comercial sem autorização prévia e expressa da Empresa.</P>
        </Section>

        {/* Texto jurídico ESTÁTICO de propósito: os valores daqui são os de
            lib/plans.js (PRICE_PER_UNIT, INCLUDED_USERS_PER_UNIT,
            EXTRA_USER_PRICE) na data da versão, mas não são lidos de lá — um
            contrato não pode mudar sozinho quando a constante muda. Mudou a
            tabela, sai uma versão nova destes Termos, com data e aviso no app
            (seção 10) — o aviso é AvisoTermosVagas em components/PlanoVagas.js
            (TERMOS_VERSAO): versão nova aqui = versão nova lá. A v1.2
            (23/09/2026) trocou "usuários ilimitados" pela franquia de 10 por
            loja + vaga adicional e tirou o pró-rata. */}
        <Section title="7. Planos, Preços e Pagamento">
          <P>A contratação do Aplicativo pela empresa contratante ("Cliente") observa preço por loja/unidade ativa, com franquia de usuários incluída, acrescido do valor das vagas de usuário adicionais contratadas, conforme tabela publicada em zcheckapp.com, nos seguintes planos:</P>
          <ul style={{ paddingLeft: 24, marginBottom: 12 }}>
            <Li><strong>Plano Anual:</strong> R$ 97 (noventa e sete reais) por loja/mês, com período mínimo de contratação de 12 (doze) meses, cobrado mensalmente no cartão de crédito. Inclui implantação assistida sem custo adicional.</Li>
            <Li><strong>Plano Mensal:</strong> R$ 127 (cento e vinte e sete reais) por loja/mês, sem período mínimo, cancelável a qualquer momento com efeito ao fim do ciclo mensal vigente.</Li>
            <Li><strong>Vaga de usuário adicional:</strong> R$ 17,00 (dezessete reais) por vaga/mês, em qualquer plano, cobrada na mesma fatura mensal.</Li>
          </ul>
          <P><strong>Franquia de usuários:</strong> cada loja/unidade ativa inclui 10 (dez) usuários, e a franquia é somada no Cliente — 1 (uma) loja corresponde a 10 (dez) usuários, 2 (duas) lojas a 20 (vinte) usuários, e assim sucessivamente. O Cliente sem loja ativa conta com a franquia de 1 (uma) loja. Considera-se usuário cada pessoa com acesso ao Aplicativo, cadastrada ou aprovada pela gestão, cujo acesso não esteja suspenso, em qualquer nível de acesso (colaborador, liderança, gerência ou diretoria), inclusive a conta de gestão criada na contratação. O usuário com acesso a mais de uma loja ocupa uma única vaga, e a solicitação de cadastro ainda não aprovada não ocupa vaga.</P>
          <P><strong>Vagas adicionais:</strong> acima da franquia, o Cliente contrata vagas adicionais pelo próprio Aplicativo, mediante confirmação da gestão. A cobrança corresponde às vagas contratadas, e não ao uso: a suspensão de um usuário libera a vaga para outra pessoa, mas não reduz, por si só, o valor da fatura. A redução alcança apenas as vagas adicionais, nunca as vagas da franquia, e não pode resultar em número de vagas adicionais inferior ao das vagas adicionais em uso (usuários ativos que excedem a franquia); para reduzir além desse limite, o Cliente deve suspender usuários previamente. A reativação de usuário suspenso exige vaga livre.</P>
          <P>O período de teste é de 14 (quatorze) dias, gratuito e sem exigência de cartão de crédito. Durante o teste, aplicam-se a mesma franquia e as mesmas regras de vagas, sem qualquer cobrança; as vagas adicionais contratadas no teste passam a ser cobradas a partir da assinatura. Não há taxa de implantação.</P>
          <P>Considera-se loja/unidade cada ponto de operação com equipe própria. Para a franquia e para a cobrança, conta a loja ativa no Aplicativo cuja data de início de operação, quando cadastrada, já tenha chegado. A inclusão ou remoção de lojas e a contratação ou redução de vagas adicionais no curso do mês passam a valer a partir da fatura seguinte, sem cobrança proporcional (pró-rata) do mês em curso. A remoção ou desativação de loja que deixe o número de usuários ativos acima das vagas disponíveis depende da prévia suspensão de usuários ou da contratação de vagas adicionais.</P>
          <P><strong>Cancelamento antecipado do Plano Anual:</strong> o desconto do Plano Anual é condicionado à permanência de 12 meses. Em caso de cancelamento antes desse prazo, será devida a diferença entre o valor do Plano Mensal e o valor do Plano Anual (R$ 30 por loja/mês na tabela vigente) relativa aos meses já utilizados, sem outras multas ou penalidades. As vagas de usuário adicionais, que têm o mesmo valor nos dois planos, não integram essa diferença. Após a cobrança dessa diferença, o cancelamento é imediato.</P>
          <P>Alterações na tabela de preços serão publicadas em zcheckapp.com. No <strong>Plano Anual</strong>, o valor contratado permanece garantido até o fim do período de 12 (doze) meses em curso. No <strong>Plano Mensal</strong>, o novo valor passa a valer a partir do ciclo seguinte, mediante aviso prévio de 30 (trinta) dias.</P>
          <P>Em caso de inadimplência, o acesso ao Aplicativo poderá ser suspenso até a regularização, permanecendo os dados do Cliente preservados pelo prazo mínimo de 90 (noventa) dias.</P>
        </Section>

        <Section title="8. Disponibilidade e Responsabilidade">
          <P>A Empresa envidará seus melhores esforços para manter o Aplicativo disponível. Contudo, não garante disponibilidade ininterrupta, especialmente em razão de manutenções programadas, falhas de infraestrutura de terceiros ou casos fortuitos e de força maior.</P>
          <P>A Empresa não se responsabiliza por danos indiretos, lucros cessantes ou perdas decorrentes da indisponibilidade temporária do Aplicativo.</P>
        </Section>

        <Section title="9. Rescisão de Acesso">
          <P>A Empresa reserva-se o direito de suspender ou encerrar o acesso de qualquer usuário que viole estes Termos de Uso, encerre seu vínculo empregatício com a Empresa, ou pratique atos que comprometam a segurança ou integridade do Aplicativo.</P>
        </Section>

        <Section title="10. Alterações dos Termos">
          <P>A Empresa poderá modificar estes Termos a qualquer tempo, mediante notificação aos usuários pelo próprio Aplicativo. O uso continuado após a notificação implica aceitação das novas condições.</P>
        </Section>

        <Section title="11. Foro e Lei Aplicável">
          <P>Estes Termos de Uso são regidos pelas leis da República Federativa do Brasil. Fica eleito o foro da Comarca de Ilhabela, Estado de São Paulo, com renúncia expressa a qualquer outro, por mais privilegiado que seja.</P>
        </Section>

        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 24, marginTop: 48, textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: C.muted }}>INGO Administração de Negócios Ltda — CNPJ 34.164.735/0001-72</p>
          <p style={{ fontSize: 13, color: C.muted }}>ingonegocios@gmail.com</p>
          <div style={{ marginTop: 16 }}>
            <a href="/privacidade" style={{ fontSize: 13, color: C.ink, textDecoration: 'underline', marginRight: 16 }}>Política de Privacidade</a>
            <a href="/cadastro" style={{ fontSize: 13, color: C.ink, textDecoration: 'underline' }}>Página de Cadastro</a>
          </div>
        </div>
      </div>
    </div>
  );
}
