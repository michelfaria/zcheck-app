'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  CheckCircle2, Circle, AlertTriangle, ChevronRight, ArrowLeft,
  Plus, Trash2, X, Settings2, Clock, Lock, Camera,
  Users, User, LogOut, Store, BarChart3, ChevronUp, ChevronDown, Calendar,
  WifiOff, RefreshCw, Bell, BellOff, ExternalLink, FileText, PlayCircle, HelpCircle, Award,
  // Entraram na troca dos emojis por ícones de traço (ver RankBadge/StarRating,
  // RECOMMENDATION_ICON, VERTICAL_ICON e as conquistas do ID Operacional).
  Check, CheckCheck, ClipboardCheck, ClipboardList, LayoutGrid, Star, Trophy,
  ThumbsUp, TrendingUp, Upload,
  Image as ImageIcon, Pencil, Smartphone, Lightbulb, KeyRound, Sprout, Flame,
  CalendarCheck, ShieldCheck, UtensilsCrossed, BedDouble, Tent, Dumbbell, PawPrint,
  Hourglass, Share,
} from 'lucide-react';
import {
  fetchTemplates, saveTemplates as dbSaveTemplates, subscribeToTemplates,
  fetchCompany, fetchUnits, fetchSectors, fetchChecklistTypes,
  fetchUsers, fetchPublicUsers, saveUsers as dbSaveUsers,
  fetchCompletions, saveCompletion as syncSaveCompletion,
  fetchClosures, saveClosures as dbSaveClosures,
  sendRecognition, fetchRecognitions,
  fetchActionPlans, createActionPlan, completeActionPlan,
  uploadPhoto, getPhotoUrl,
  uploadRoundPhoto, linkRoundPhoto, getRoundPhotoUrl,
  deactivateTemplate,
  uploadRefDoc, getRefDocUrl,
  uploadUserAvatar, saveUserAvatar,
  reviewCompletion, fetchTaskReviews, fetchCompletionNotes,
  raiseDispute, resolveDispute, fetchDisputes,
  seedSupabaseIfEmpty,
  subscribeToCompletions,
  requestPushPermission, hasPushPermission, fetchPushStatus,
  setCacheScope,
} from '../../lib/sync';
import { getTenantSlug } from '../../lib/tenant';
import { useNetworkStatus } from '../../lib/useNetworkStatus';
// O dia de operação é sempre o do relógio da loja — nunca UTC. Ver lib/dates.js.
import { todayStr, addDays, daysAgoStr, lastDays, weekdayOf, weekStartStr, tzOf, tzOfUnit, TIMEZONES, APP_TZ } from '../../lib/dates';
// Regras da RODADA (loja × checklist × dia): reexecução conta uma vez, e tarefa
// já registrada hoje não se refaz. Ver lib/rounds.js.
import { latestPerRound, earliestPerRound, roundProgress, statusFromProgress, submittedTasksFrom, mergeRoundState } from '../../lib/rounds';
import { gravidadeDe } from '../../lib/conferencia';
// Domínio do checklist (o que vale num dia, e se chegou no prazo) e agregação
// das execuções. Saíram daqui na Fase 1a da consolidação de abas: as três views
// de análise dependiam deles, e nenhuma podia sair de page.js enquanto eles
// vivessem no escopo de módulo daqui. Ver docs/PLANO_CONSOLIDACAO_ABAS.md.
import {
  // `applicableItems` saiu daqui no carryover: a tela do operador passou a
  // pedir `itensDoDia` (previstas + arrastadas). Quem ainda quer só o que o
  // CALENDÁRIO prevê — a aderência — chama a original de lib/checklists.
  CHECKLIST_TYPE_ORDER, matchesShift, isItemApplicable,
  templateAtiva, completeRoundChecker, completionOnTime,
  isUnitClosed, templateStatus, templateProgress, itensDoDia,
} from '../../lib/checklists';
import { UNITS } from '../../lib/units';
import { visibleSectors } from '../../lib/sectors';
// Ranking e índice operacional da pessoa. Saíram na Fase 1b junto com o
// substrato de que as três views de análise dependem.
import {
  RANKED_ROLES, RANKING_PERIOD_DEFAULT, QUALITY_MIN_JULGADAS, rankingPeriod,
  collabIndexSentence, computeOperationalProfile, currentStreak, longestStreak,
} from '../../lib/ranking';
// Contextos de tenant: as lojas e os setores da empresa logada.
import { UnitsContext, useUnits, SectorsContext, useSectors } from '../../components/painel/context';
// As views de análise que já saíram daqui (Fase 1b).
import { JitPanel, buildJit } from '../../components/painel/JitPanel';
import { PainelConsolidado } from '../../components/painel/PainelConsolidado';
import { truncName, ddmm } from '../../lib/format';
import { PERIODS, countApplicableTemplatesOnDate, computeProductivity } from '../../lib/stats';
// Átomos visuais que Painel, J.I.T. e Relatórios desenham em comum.
import {
  ROLE_LABELS, MANAGER_ROLES, STATUS_CFG, Eyebrow, Ticket, Avatar,
  StatusBadge, EmptyState, PillButton, RankBadge, FeedbackThumbs,
} from '../../components/painel/shared';

// Thin local storage adapter still used for the version-check key
import { storageGet, storageSet } from '../../lib/storage';
// Event instrumentation (MVP Inteligência Operacional — ver docs/REVISAO_MVP_v1.3.md)
import { track, setTrackSession, clearTrackSession } from '../../lib/track';
// Execução colaborativa em tempo real (H6)
import {
  fetchLiveTasks, claimLiveTask, releaseLiveTask, reopenLiveTask,
  setLiveEvidence, subscribeLiveTasks,
} from '../../lib/collab';

import { parseImportCSV, buildModelCsv, csvNorm } from '../../lib/csvImport';
import { C, R, W, T, successBright, greenOnDark } from '../../lib/tokens';
import SideNav, { NAV_ITEMS, BOTTOM_NAV_ORDER } from '../../components/SideNav';
import { useAppUrlState } from '../../lib/appUrlState';
import { LIBRARY_TEMPLATES, LIBRARY_VERTICALS } from '../../lib/library';
import { billingState, priceForUnits, MAX_SELF_SERVICE_UNITS } from '../../lib/plans';
import { getSessionToken, setSessionToken, persistSession, loadPersistedSession } from '../../lib/supabase';
const LOGO_DATA_URI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABEBAMAAADD1i77AAAAHlBMVEUAAQEHPF0EL2MHPFwIQmUHO1wAWl8AAP8AAAAAAAAlhJ1KAAAACHRSTlMA6xee/l8EAdSX9pUAAAV1SURBVHjabZZdbxvHFYafnSVHEmKJnCUpGZJMDakPFwmckpRkOKjrWKaMXLQXlGW1QI3GWxXxHyjQH9MroVctirbxXS5S10bRAEFqi4YVR7VsZSXVlmLLXOoz4lrc7cWSMmN5bnZm58WZc95z5j0DzaFhMG8Jix8OcTRzsviONiMCsrxliPzlrFEiarUJqexjFrTE2nTEUw21SD03dwzgeH65OkQs7kf5VbosoK1hxQw/wxV98iC7Ugm2O34ZbFnPoF4OdwwA7AW/GlTZfWd7wK2KeGbel4fvP/SaRwh77tS3/1uNFk+ZMUTWyK/6cF31Hh0RlO0vT+4dRrc6q6Lt4EdBMPC0Xo/0PKoFDUc/KUjTSgilcjYyK6aFJTDV+GWpGz5Ez3+7qox+I/M3tAPMflrhquFuVp1GpKWpFGOpFGhg5IbAlqJojI9EtQ0go8WsKmVKWfmaP/EbK6+5agEm9Y/XNoJUuXOhGTkQ7JzYWB9czEdfYkL5xbn2/56ubF1vAuwy7rasiZ++kzhXBhumrN+WQLSmaDg3le+O2hrAJqpKMlrUslkZs0iixehZO4wBWw+d1cZkQoeZi15CaimUlgxr24z05P400/V5VXRt17pLZTtzYTOe2HvV9/P+xd1ht/szI2ukYzdTz0FM3fF3PXuh37g9yvyOZ57ZqUTqFdN1jY7RvkXEx3+WpEpzXnWRjt7Nl1xfqib2jJo5s+/k3UcuxkIXeHfNyMkqub9uBxS26svtxqH5/LT1z/Gv6hj69AY5c7N9Jxjd3+txmf/oi1Pn3E7zJImtzZcQbBltz3cS37UHk23r6Xngof2PxWoVxGCyu1F34yplTqRAzh7xdQVpIzUA2eSkUhmlEoUGpdlppSzABpiFG4N5pZRSk0VChsfU+AgA0gaEBIRSJTl8pcF4HsSM0Syae84nFYdlhk51zcleB2Aq8tiJhPdCBj1r7/7b6uhYJ7N/54z5rA7YXz60eBoCTKMSDGy0fdPhsr5BZiW5HUDZWl93ZQiop1+0bUSWz30l0dXkE1Hbt8uwO32gTjR9+HH8weHQcmx3YCXojzwZvbfrQaaKGYQWRKZ319UrHy71B+5E2a9JXY9XUR9gpsIaSefv/6e+G9w883U8//dRJ7/wYHsdDXQ5IeDi4U9+V3jcOXW/v+wHnRGuxXjFRbbj/msFEleESBaSBWUjxmUjEzNH2yM2YE4MTgildcg89rTmRotIaTKXTSujtCZMpkiqwpHCAFUmv9ivQTvVeQBpfHDwvKNHtNhw0nogBxfDlefXn6h03GwBeP6lB9+J7s8aS2Ns/NZGe6tSKi0SgxNNqc0mNL9vVVIpihKdUakwxjYxltKyVYo9U3iQ430PgJq+H+x5rQDpA6wZ1cYdtn6mAks3AFKTPfTrUgjnwoIHIM3OvSUl0MZrJzJbFZj5S0NEdld9/97wKycSBjAN/i1mgPG+T0NS/PsX9FLDB3vAdd2tnOm6rhvbA+CP84l6fHs21Mkbf8hUj3qIb/3LA9AFbl6605DrkanXjShalA1a1FjOBgP06C2CXwAcRvjcTIcW0EZ27VEopJNKdR+zAOKsAEx+7a50nX/yPYC4+t5BPP64ARj4OgAEt0dN527jl+sOVI7IdWyACOBpED4QcX0nnAEwFwKcMfGsj4gHLAEZpNeaZBO+f/dw5fwSyKDQe/69/W/2g1aAgQxiddjzkK+KwF2j8kZr9q59CPTaHEZc13XN9PGmzMhwMt7QreiEPt62b0CmCEiRzU5dfltjb8tGkwWkzEyopGW/5XlQW+67GCt5nohT77r9Q0CzoqKx+tBL88Rauuy//YFxLWaecN24ce/NIJoWpDdYgaEXq28Y4P9JDehlYotRagAAAABJRU5ErkJggg==';
const LOGO_LOGIN_URI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAADVCAMAAAAlzk/pAAAAP1BMVEUEKmUAXmAHO1sHO1sAPj4HO1wAAP8IQGIAVaoHQGAJQWMA/wAAAAAHO1wIQGIIPmAAAAAAAAAAAAAAAAAAAAC2HQLVAAAAEHRSTlMVA6FeBNAB1gNHjQEA/P7+y1GA0AAAF4hJREFUeNrVXYma6yiullg8M/fa8P5vO0ZiERhs7Dipnsw33X1OVRJkbb9WYH39ZRC0Vsoq/iOs+v+0hvXLr3e/AHcClN22zXvvNv5ssyq3Ob3/+3+IENic81t68Wfjqnz4b/xnE4JYfZgtZAQuoCCk+01g8J9ACPJBy5+DFAXBIr5YQYhTY9Eyf0wIhAOAVhbEkZgQq3btBsmmnTu9b0L1mhV4+jnEB1B2V2qdmUIP36vmM43d+spuVu3cTjX8MUe03cLz36UG84cBnRnMboKFBdiFTXeUHTGoVLBuy58RsvNiy/YJpNlq1YGI61qtpFEW/5AjYFmr/VaLDdhwMGN2nuTjRkLg8M30g83/JSFBusMhlCalELJlfcWhQIj2W/N3wr8EQv5Q2Rd6mjsrmsfN0hIASgYlTLOFIx162/6ckP1tiRXKC9mK9jf4kfSXREjvsBidpzAWf0BIlK393XzM6KCTyAnNYdoOHIm/abdTX/kVQhAqwYiyBSDtVlSI+KBNkbajQjND1PYWnpwmBJvfBRZvOqdToMhRRBPlwtFV8g77iQ+iZYhip7T7MSH7IXftNQebA2ZhnWXQHk2qKgAlPPqOHiDDSwjypX+qI6C9lZQgyfh+wOgNku/e8Uh8/CBY1+oBRoaQ2MHwEIhvE4LsACUlACqcX9uiExgZZRfApXJ7rfhA5GdE+OOz4auEBMlnYyQw7BLVoY6jTHzGTAeaYhVMz1QEsbPjr62l+QWOIKh4XkFJwuxBPyzLlolWdWcDojFFq31LCL2V6PEjN0I/ndefOUKSIkhKkmv2mwJIskV/uR+bSQXFjqbBjJgAsYGxGwEASz53UvpnlT3FsF7wJCDEPQ6E8F8s8hCB/H6KHafsADkTgib8z8SYUkVvCmM3Ehm+W/Y58ZojpIhR4InEI8Fu7a6STBj9hKkjmMKHVS1Cyfy1Wg8iFfGNzsLUISetVvQPZLsSJRmgF/e4JHskDAAdyCp6UQScz+jdIFJJqrXx/6c85rRDpC/XFSUkUaTHWVhA8o7xMRG2R8QBSDoXBWprk0a9B7eTkITg+pzjX8DlgPF2gSVlqIAt6TgmI8u/6DmPEhIp/5YZov1lmEfWMj+8hd6hIFkWotipDzgCLbYiz4dJrY2IYjErPkaZsCxFQbWB9cX5HEXxm0L+ZRtYX0SWT51CUacecwSCN8IDS/RaU8LRyH6oJCY7dwCgNqOUClbWkuqu8T0Ee/rWF7Ki7+dnAOEuHQoMvWprLjAKQkIrmKM/Ff27L6Z0t7QG4eAZdpIorWp3ahEG1lcGNYETdiqKhLGV8pUeRuHXEIWM+cUwhbGKVSRka0sA7l4eCv7b2fcvgfkPRivFNJpyRZZAxTVD+oRkS69xwToCUdGjB95gyZH6bSZnGNxizu5lQqCTDiCBzYbcT0TDMMpbuQhpM+dzdKu2bG7o6e3mR2mC8HO4CI2IBI4xMCn6/sUANbB+QAi9i/nrJUJglmSoqIARCfMCb0dH4Snsyg9dBQEOeNjfFK4B3NWRAgmzN0ouIn08W/eHVCR9aYQ/CnXALWxc6iIR3uMIhQGQ804q62PCwG5HiiHFrpgA82K1iOSJZEmxuVe7vmNmFwyBF3TBSHhOJrpVgm1GsD3gdoYnwZjgJwH30qiVId30wTozetv1SfozvRWqLgiJoqlJJ1OGN/s/ZNBKsrQ/Ow3v1tMSUIPoEytkjGTGhlkw6NLBYQBGl5EBKMa6JgcV8HalNnuQCH48WQJMGhrRygALw1FIszztj93YOgoR6bhlfbm+idmDGDwwxBS30q+rHp+qiT6OFEVvVTxVlZqXd+lInlCRKLCnSqdbwklcAf4wpewFspVQPeJEYnkXeb9jsShpicVkmZIeFEFOV01gGEQF1rKY+fIgvls0XxTh3cwQIVaOZIQBR1dN4DReZgpUka7wHVZ/r4mBbK2pGRLVPGht0uBOjRhOAtvMSZ0pSa78Sy+U6RkoaSfPf4aMZmEaooiQQDj5ZHm/SgmmnB7y+WKFrkr3H2EkDAs5kRBLGYXk5PWKX+4pifJAFQv2gm4TZpdCaWdnOSIpCXWOKKZfs1fNmViMsaiHZ+XHqMAK1mlCiBK/lVTo/olOWHAEY75EFe5hOgl09uZKGqs9Xu5ZTTjBxVDgesBWusDg+Db4lvnSXi8Yn6UvWT58lqDLoNFlCkRfhlIfRSJ4AVYi2I0pU8pCueS/8G6mETMllFApaREqmDjHseEjUnDCeCGxgUJU+sLz3Bacf54pAbrsOIl+KUTr8Ax0aXsKD5bkAbLFh0O2sf5auHpGOockSwu32fkrfcwAzaizvWJljCEywfWXtKEQlF/qguNohveoFnoZNEoFESnX4LYBDgIxAYZXk9FL4XuMCeuDUzK2whgQP5nqNaaThQ1u3ddZZKwISbEvzqrFfkLP7U3QtjRiJ6HClrjhaLA2oYyEFSHRW+ruafaYQP+r0bPwSKscO+nKaYpDyVRIBB2xCxU4l6qpDweO4NU3EJGQy05GnbeDIo1uO3JFUTLocMT/X7XaKq44eyJfOaEhawbUJBVz29Qo7P3WAFLMYFdSt5Yvh0q0gkWIrq+WkSADIRnUBwShobGiZVjtw6ogWjQsVBsazqpKFRLY9RqLhsMeJXkOkqqWt2iblPeFKyjR26ZwIPGhmuC9YMqQEpsaV4RkdV8NJakC5+khYCEjwJa6nw1yLJnapwQp2PnsOoULUsT8qCwOVawN25iOFpWSmng6QdLwnNbO0LIyv0SrE+IOJQ173iuS5DJ+fi8LAAKH4zIkxHWcd+hE1VLDY4XUQqwpY8chQspUECkGuJv1PBXO1TUnRKOX8/OFEOhKFhWz+/4o1IEha7j3Vse4q+5ehUrsEynsGbQfVV1bUrQU8vYwWbuB0KD2LR+o6KjH+b6iGgzvINawKpZA/ZVZCl1MWVwwBOhhQe4R6hX4cy4DmrwOFdpD3TTSgCNYW8gAYQSxat6jnxisSYm5Rv725cJbQ+NSAiVLN5XB2ioNdm6hD73bw4fFn89kQCr4BYcve9XT40tPI0BKob7nxTtkC+wOJrSRkmgQwWgrf5dd++7W8SLyzdyIZQx+MoqVIIuWSvKJDNrCxya3Ms7ip2jY+Z4zqP1JSiDXZESOXCZfDeEhBRL+QsobRmmjY1OIFOtnLPKY3copQ1rsOKQEsp852CpPan4ZchMZy0FYncA0EI2Iy3VZQ+mjFXdS3BlDsNLbhpIKO5x4QDa8SptTCYZes24wxAJQlbQRV2cZ1htSFX3KEGgISf0nbe4fzwnhb77oZQI8otBA/WqWwhGprft/WVYYinLgMoZzPiM/SwNvCQ/Kwt9IAquQRp9KV8fKNOELRPvppW2PZfNLVxjeSl1YOvWfZPNa/E/d+MS+I41hSUruZskaCwEkfKittD/O2anhpya8I+OofZUnbjLiFL/t38kjl5uc9oNbffrQyf1yvEmTRiIHTz2X1+VLajTZ/7l7NOqjEc8/vR2sePK6QlFMDg03PJ9ZiOcXKcPQQiW8m7vxkOBobOPRKl0PbGJQgznjyuQ8K1aEJqT2BJkWsu43J1Rg5aA76ErphRGtUIWOAEZymzY+TiBDwVWhfaI2CEnG4iDY/BhBSEl6jrql/nLmCkUvYIa4At4ROcbcYoNkpqVutmPwgIkxzs2XCsG6gVus3WYF2PEDNkQSNjb9FvrF0Chk82ILWz8Kt8GQNXGU5+ESogbXB3YqdENGCyHc78Aw3ZsFBjNIJwRkACNcst2eCC1s8M1zgZOkLdwqfqiB89bDn8SAej59r1s21KHlO1WnXYDoS46M0Se45I7vqIBOFM8qPH6tfJZ8deqKb7FURO2VVbvx5QlDJzZkGpI1f4uQnPonQd4aUvyO3hAipY5f3t8brgIeMFfShGO03q9yJH4uf4dqZUgqLPUzK3WTDjE9myJ8FJH+q5XZMMdDufUmmLImmHTET/YicM5RIyQ2VB5F3yNkGQHqQ9s16MYxhnlqDIIXZpYIZt6sPZK2h9RJYUP2KN7dIiRyszkyZtQGXOmgakft6WscZBAecUT7LKOtR+kUg07pKGrGh1kw9pCndSgFODcunqKvACmXI9aaxnPhgw6OnU3xDY7sIbqNhq/KkAjIc5phiF4mDmSsD0r0EFuu8ndxEiaaMZh+INTRQQ8iHgZQgv7ZV/wEblC9xxfrS0qJky/ZFM9HTovc3cIuz9pDknH6Rds39K2eKZPgJz26HIolUzzPEfX00ENiPG8SMfNmy3vpEyvDMx/Lwo3HPUtzyD7hJFd24bbSrTdieUfZt5E6VBLmw86HGyozKIuPYRB07fcd80ujVD1awoPKuRKCgnjBiPpPGuaaQADMzbGLcTEEdS/oEPksmjg+lKWKR6H0RC8ymdR6oMxTrBzIBP0tKAXr4RAEQMJwQfax5qBPtBIhJ1J6hV2vZhIEbbCHWV3wXqM+drMM1DqtS1oOzKHeaUVYBGg6lsNdj3+Gj7VWZZAAPEj3gCMm9Q8fayEgM3D51MUHl5CXwkLoGHN/NSfN/Qve5X4J7v6wMvc8S0dH1X0eLoh1fJFaVFqX5mEr8nZQiu1uonMiu/Z+3On8rWjTVPKgs5UCmRWlhsF4ZK9X+QOQs3h57k81nRNnlKDtd7BEds7D6LqasQkepF56mjouww4IIMaoZZ4+2zUbQhe/HYblR6jRAgeYpbjkuBUKHtBBTQGpZKeL0w/VHUgKEnTH1GwQFOYcvdNVntKPKYG4IYJffPhM1DQhMvMZPqxALxDNDCCRTJgIEsZh/8li83swM86STXe96mOHkDBoF4LNqlcg2EgNd5FWHExEm590slKBOQhllgllrcoLztHKoXoxTLHXw7olxnVqkKfWQMB7mF2VkK2nTX24WRRK76ERA9yUv/ZVMi79BYljbghMyzuuehQwxroLecZoFCkssts0IaJ6AzxrpbOUxG8IBa7810FbmmquhbJZo2xQoWH/VXR9j9t4YvaBsxYYUXaR3ClCFsEAsQ0zekOe8oG1NcNYe8842RQgtBgh3+JeG1MUZaAmUNCBVQeghLMLXlyo4pSOhuoQnJTAtW+GGy0OtUpomob47Xk8ok+I+MBYUcqJgJ20f88SEtpBbZzNLYnYIs4GCuAKpSqTFcRWbR2Y6C66H+PthZtEvbMwGaNWGxielvC2qrmO65vSjQspSz48djSa9mQoE067/uLQ4PgtIi0vSpyU9ptPPiCsVSOt9m2zgnR4UDxIJsm2oQN3Nzorm+4vzpASx5Z66IwR6ebHuV/4Tx1BSE0HENoCtS40XtbVnalwkrnDmqZipxYykU/paB9gLhaS66twiuzNPETPtw5A4SF0LdRzjmAno5lGngX4yk2mPRh1J0W4svYgyt6TFwjpqWKO2YWCrALBdKYhzI3SsTtbLwFv0QFi/hIklEVjL+DgdDK+tMcdaXmNkIKGd1+fVhcZOfj70YbMYhN97MJC/IpoQRWRB2tEfYRQgO2Hqz5hqzqXDrS8Q4gEkdQ2DsoqqCdUPyIkmz631S2YiK8SAgVEyklBrEKmTwhJm8jE0EpDy0uLtaFtm0NeSGLd9gohsTjdNC46sbII3pSsHS0uw/TRJ4SkhWt5x3tu9su0wJs2q7KwbTvtJwuK5cAfN4FJWgiEv6QjtgR7nbRLixofUCJBTm6QiwPi9q3OhxyeKLnH5Ji2f7zzoswWZZzItADVdzlp+46K+K3eci/SR/460zODf3yOaCpa8nT6O4SoZixQJh5s6QZ6/AWhI8d2rAWaVx1iBIzii4xMviv3sWwxTO5f/IH4nvmF7SBZKtd9Sl37qQGm3QiPluk9RL54APVVQv7h5QM8HxuWR8GXCUn7w5SM6VXYXGp1U9Z+IFtxW7PVFzE9vKbrtVECnobGqhfxiU+M60B5ah7gm4QkLejezNFko/DuVSNLxmtMivkeIUt3nw/tAG3iiIeuBNLkGo+MmW8REn2fV6dxxEcwJfex+W3YJgFv6Xrfth7ynPfVPWx1LvvOhh0fb3BEnSy5g/MRxRlPiCuKAfA83P2+srdrP9riTKyrPLFbCJbHsY2cV+Xh7rcJaZPqw+QKFQ3uaTsvyaAUMy1JyFrvj2s/4AVd9+M6U6rd0rYxSzWeO5X9JLQpZZK1fvf1prbk8Lmu884PewZeQkEpJHrtHckqvjTVyTCM57n+rMMLosWet9d5W2dLcV3vdYyI22XKHqe8BsHXixU+V/YTLc4gGNJGnAdQtJ72l1PqVf3342sECyHmjJCHn7vDkrysIk+aRltcL5iGj1UkbXHt3kpHiyIfYUVIAI6xlligvCS3Au8SosaEANUC7kwgNXab+yVSETLPilPPmVKV2XpIyLJwNz+mSykPbfbLQr+jeMMB4s1WvXgFG5fxlWsXfDwrK5zOwGl/2q9QhxY3fZNNt06lW+FATrLerlg1b0A5X1F6NdMaxeqneQwDYg/iLUCd9yqVTeNwcofCTPAfugXya9DCG7q9O79QcltW3VAWXe0SMtmn68fxCC3k8+V12lZ9/mPn1ax0pS3Waa9SWcA86oKaGFm373X3u+kBMdncFVs/9HjP0gQheKO5f+Z1q4cypQIgLpjbTu4i+T0h86YLaM4t9yaYdBdJd/XBE0L8rZdzor/1Tjxiwp7xcFkEquoGmv5FSzArq8n05Je69bIP0ihA656pHwR4g/zJ+pwbHAm3WzzfJ6ufxOyQn6TODZODj7ggZEEZ3dTvnHshT1DGCxDvJh+olzatODzJ1owJKSOkJVj9BGAaUO5Z0rQgLf6XueFHYufPEjq9cqP7ZxdC5Kvb7iN6EEMcfriUdnAjDI1fUp/ax3WzlpAHH6P9tfnuc4TmJP3HWduXCBGF1bEbgmOGUt7H8I8gJLcenIwAdDgCarDjBP6MkDhLdPowjwtelKtWq71MyEPGUqP26UOAYfacFl3Yzb8jWqny+/R5hPQezod/aTkyF1X4Vj1/jxCMfTW8SoBac3lN9CvPYzqOzT2vlpurZa/iZ1d3HpojHjBl+osLsOI7MtZypd8kIbRQRmDKNDKoyx0m+AOOlPmPLMopAzvLEeVcjd/TDYMfNz/cIQTL4BMeU6ITJ4DLoXdY4Rc6UrJtpiFk5ia/mWjya/d+NFbr0GucCbFTHwbbOUss/pQQAQXK1MScru+oP0e3x+zQ806njzkCYgppzkSW5UAqZ+v8O03Mn+iIHKd6cnMyJ1CT9f0VIalGkFa8yxBx2pWV5UByebP+smMf+JFqOazys2eAbk/VAoDjYZivEAJiJtpAzaVLR1KHwiHpwGtBA39uyuebWCtf35oHcq77YXLiZBh2f/H6qP4dqnHSnfZ1ZkB88TRLqUSm72gxaErPebX+yI/k23dSGw7BpykgX621EFDLubK45otG6xhYlQypp7UQebf96ePEmTXL3zRao8tP8xKgZtHmSaLDvZqL/5iQdbxl5ux5zi2+/qKKdFuT9KBGZc+uJ7iCixfZnC8Qwm08vc1N5yIOYgudtd3q6Tfv7hulTHm33OabbfBw4RPjC2SuXszt4m8Jib7QxFuZypM+NZ/DJPcS71OzX70T8rKsUBDfs9xBGXOH9S8IKZJi5DpoexsslUugv0rH3LGg3aF+CeNJUUK5SuLFvyekpsTcyqKVitd3b02dFJRSorg6EYgN8iIx922G3FhvqEvcfXImTcmHnHbwbvsNQ9Y7LRX5UGYkXjhI0HmL377IFm78ptwf1N+7MOy/+bZg3WoFLKNs1Clplg7eGoKsr9+PfIfjWJ64V537W+Nklf9lGPKMELERL97f2jYWaloVVQ+NfDMufEZI0x0d7xTobBbVz5rNfkdIM0rsylg8ldli0a0KZ/z2GzruIidTF+G9q+/NMxBifL/d2L34R4SIC0ZlCduWriyp635T8Bt+POjElpM19fLu1l715m7+QYTEC0a3q5Xe4Qaz35HxrDc+mKnjRRBNX7O6Gq79BxBSriL1g9terILfkvF87ALjihJ5sS7X2uJO+OWnZHwyP5LWeuR8jxWXg5gfk7Gu/wX7uiQ4M4OKvQAAAABJRU5ErkJggg==';

/* ----------------------------- design tokens ---------------------------- */

/* --------------------------------- data ---------------------------------- */


/* ------------------------------ access levels ----------------------------- */

const ROLES = ['colaborador', 'lideranca', 'gerencia', 'gestao'];



// Logo a exibir para a empresa logada. Ordem: o logo que ela subiu → o asset do
// IBR (que não tem logo_url e depende do embutido) → ZCheck neutro. Antes a tela
// de login mostrava o logo da Ilhabela Republic para QUALQUER empresa.
function companyLogoSrc(company) {
  if (company?.logo_url) return company.logo_url;
  if (company?.id === 'ibr') return LOGO_LOGIN_URI;
  return '/zcheck-logo.png';
}



const ROLE_DESCRIPTIONS = {
  colaborador: 'Executa os checklists da sua loja',
  lideranca: 'Acompanha os checklists da sua loja: feitos, pendentes e por quem',
  gerencia: 'Acesso total a checklists, setores e edição em todas as lojas',
  gestao: 'Acesso total, incluindo usuários e lojas',
};

const ROLE_COLORS = {
  colaborador: C.muted,
  lideranca: '#35577A',
  gerencia: '#C2622E',
  gestao: '#2F6F5E',
};

// Which bottom-nav tabs each role can see, in order.
//
// 'id' (Meu ID) vale para TODO papel: o perfil é de quem está logado, não um
// privilégio de cargo — e era por não ter esta aba que gerência e diretoria não
// tinham onde ver o próprio ID nem trocar a foto sem passar pelo cabeçalho.
// Custo assumido: no celular a barra inferior da diretoria vai a 7 ícones
// (~56px de alvo em 390px, ainda acima dos 44px do WCAG), contra os 6 para os
// quais os rótulos `short` foram medidos — ver BOTTOM_NAV_ORDER em SideNav.js.
const ROLE_TABS = {
  colaborador: ['executar', 'painel', 'id'],
  lideranca: ['executar', 'painel', 'unidades', 'id', 'equipe'],
  gerencia: ['executar', 'painel', 'unidades', 'gerenciar', 'id', 'equipe'],
  gestao: ['executar', 'painel', 'unidades', 'gerenciar', 'usuarios', 'id', 'equipe'],
};




// unitId === null means "todas as lojas" (gerência / gestão).
// SEED_USERS: PINs removed from bundle — validation happens server-side via Supabase.
// PINs are only seeded to Supabase once via saveUsers() on first run.
export const SEED_USERS = [
  { id: 'u1', name: 'Michel', pin: '1234', role: 'gestao', unitId: null, sectorId: null },
  { id: 'u2', name: 'Diretoria Operacional', pin: '2222', role: 'gerencia', unitId: null, sectorId: null },
  { id: 'u5', name: 'Colaborador IBR1', pin: '1111', role: 'colaborador', unitId: 'ibr1', sectorId: null },
  { id: 'u9', name: 'Colaborador IBR2', pin: '1111', role: 'colaborador', unitId: 'ibr2', sectorId: null },
  { id: 'u13', name: 'Colaborador IBR3', pin: '1111', role: 'colaborador', unitId: 'ibr3', sectorId: null },
];

// Maps each sector name to an operational category, so generic item sets can be reused.
const SECTOR_CATEGORY = {
  'Salão': 'salao',
  'Praça de Bebidas': 'bar',
  'Praça de Alimentos': 'cozinha',
  'Cozinha': 'cozinha',
};

// The 3 default checklists every sector gets.
const CHECKLIST_TYPES = [
  { key: 'abertura', name: 'Abertura (mise en place)', shift: 'Manhã', deadline: '09:00' },
  { key: 'intermediario', name: 'Intermediário (reposições, limpeza e manutenção)', shift: ['Manhã', 'Tarde'], deadline: null },
  { key: 'fechamento', name: 'Fechamento (encerramento do dia)', shift: 'Tarde', deadline: '22:00' },
];

const ITEM_LIBRARY = {
  salao: {
    abertura: [
      { text: 'Limpar e organizar mesas, cadeiras e balcões', critical: false },
      { text: 'Repor guardanapos, talheres e cardápios', critical: false },
      { text: 'Testar máquina de café e moedor', critical: true },
      { text: 'Verificar limpeza dos banheiros', critical: true, photoRequired: true },
      { text: 'Conferir música ambiente e iluminação', critical: false },
    ],
    intermediario: [
      { text: 'Repor itens de mesa (guardanapos, molhos, talheres)', critical: false },
      { text: 'Higienizar mesas após cada uso', critical: false },
      { text: 'Conferir limpeza dos banheiros', critical: true, photoRequired: true },
      { text: 'Verificar estoque de descartáveis', critical: false },
      { text: 'Organizar área de espera e recepção', critical: false },
    ],
    fechamento: [
      { text: 'Recolher e organizar mesas e cadeiras', critical: false },
      { text: 'Varrer e passar pano no salão', critical: false },
      { text: 'Desligar equipamentos não essenciais', critical: true },
      { text: 'Conferir trancas de portas e janelas', critical: true, required: true, photoRequired: true },
      { text: 'Deixar mesas e balcões prontos para a abertura seguinte', critical: false },
    ],
  },
  caixa: {
    abertura: [
      { text: 'Contagem do fundo de caixa', critical: true, required: true, photoRequired: true },
      { text: 'Testar impressora térmica e bobina', critical: true },
      { text: 'Confirmar sistema (SAIPOS) online', critical: true },
      { text: 'Conferir troco disponível', critical: false },
    ],
    intermediario: [
      { text: 'Conferência parcial de caixa (sangria)', critical: true, photoRequired: true },
      { text: 'Verificar funcionamento da maquininha de cartão', critical: true },
      { text: 'Repor bobina da impressora se necessário', critical: false },
      { text: 'Conferir comandas abertas ou pendentes', critical: false },
    ],
    fechamento: [
      { text: 'Fechamento de caixa e conferência de valores', critical: true, required: true, photoRequired: true },
      { text: 'Emitir relatório de vendas do dia', critical: true, photoRequired: true },
      { text: 'Guardar valores em local seguro', critical: true },
      { text: 'Desligar maquininha e equipamentos', critical: false },
    ],
  },
  bar: {
    abertura: [
      { text: 'Checar temperatura de chopeira e geladeiras (°C)', critical: true, required: true, photoRequired: true },
      { text: 'Conferir estoque de bebidas e gelo', critical: false },
      { text: 'Higienizar bancada, torneiras e copos', critical: false },
      { text: 'Testar máquinas (espresso, liquidificador)', critical: false },
    ],
    intermediario: [
      { text: 'Repor gelo, bebidas e descartáveis', critical: false },
      { text: 'Higienizar bancada e utensílios', critical: false },
      { text: 'Conferir temperatura das geladeiras (°C)', critical: true, photoRequired: true },
      { text: 'Organizar garrafas e estoque visível', critical: false },
    ],
    fechamento: [
      { text: 'Limpar bancada, torneiras e máquinas', critical: false },
      { text: 'Conferir e travar geladeiras e freezers', critical: true, required: true, photoRequired: true },
      { text: 'Contar e registrar estoque de bebidas', critical: false },
      { text: 'Descartar gelo e higienizar cubas', critical: false },
    ],
  },
  cozinha: {
    abertura: [
      { text: 'Registrar temperatura das câmaras frias (°C)', critical: true, required: true, photoRequired: true },
      { text: 'Checar validade de insumos abertos no dia anterior', critical: true },
      { text: 'Montar mise en place do cardápio do dia', critical: false },
      { text: 'Higienizar bancadas, tábuas e utensílios', critical: false },
      { text: 'Conferir estoque de itens-chave', critical: false },
    ],
    intermediario: [
      { text: 'Reabastecer mise en place conforme o consumo', critical: false },
      { text: 'Higienizar bancadas e utensílios entre preparos', critical: true },
      { text: 'Conferir temperatura dos equipamentos (°C)', critical: true, photoRequired: true },
      { text: 'Organizar e repor estoque da praça', critical: false },
    ],
    fechamento: [
      { text: 'Guardar e identificar sobras com validade', critical: true, photoRequired: true },
      { text: 'Limpeza profunda de bancadas, chapas e fogões', critical: false },
      { text: 'Checar e desligar equipamentos', critical: true },
      { text: 'Conferir fechamento de câmaras e freezers', critical: true, required: true, photoRequired: true },
      { text: 'Repor itens para a abertura do dia seguinte', critical: false },
    ],
  },
};

/* -------------------------------- helpers -------------------------------- */

const uid = () => Math.random().toString(36).slice(2, 10);

const IBR2_TEMPLATES = [
  {
    id: 'te555f8d0', unitId: 'ibr2', sector: "Salão", shift: "Manhã",
    name: "Abertura (mise en place)", deadline: "09:00",
    items: [
      { id: 'i1', text: "Limpar e organizar as mesas, cadeiras e balcão" },
      { id: 'i2', text: "Limpar o chão do salão" },
      { id: 'i3', text: "Colocar as mesas e cadeiras da área externa no corredor" },
      { id: 'i4', text: "Limpar os trilhos das janelas na área das mesas externas" },
      { id: 'i5', text: "Varrer o chão da área externa" },
      { id: 'i6', text: "Limpar e organizar o porta-guarda-chuvas" },
      { id: 'i7', text: "Destrancar as portas e virar as placas para Open (8:00)", critical: true },
      { id: 'i8', text: "Reabastecer galheteiros" },
    ],
  },
  {
    id: 't04102c97', unitId: 'ibr2', sector: "Salão", shift: ["Manhã", "Tarde"],
    name: "Intermediário (reposições, limpeza e manutenção)", deadline: null,
    items: [
      { id: 'i1', text: "Limpeza de vidros" },
      { id: 'i2', text: "Aguar as plantas" },
      { id: 'i3', text: "Limpar e reorganizar a lojinha", recurrence: [1,3] },
      { id: 'i4', text: "Checar e trocar QR codes das mesas, se necessário", recurrence: [2,4] },
      { id: 'i5', text: "Higienizar canecas de centro de mesa", recurrence: [2,4] },
      { id: 'i6', text: "Limpar trilhos das janelas", recurrence: [4] },
      { id: 'i7', text: "Lavar lixeiras", recurrence: [3] },
      { id: 'i8', text: "Lavar bandejas" },
      { id: 'i9', text: "Abastecer na ilha louças, tábuas e papéis antigordura" },
      { id: 'i10', text: "Limpar e abastecer talheres ensacados" },
    ],
  },
  {
    id: 't1b20769a', unitId: 'ibr2', sector: "Salão", shift: "Tarde",
    name: "Fechamento (encerramento do dia)", deadline: "18:00",
    items: [
      { id: 'i1', text: "Limpar mesas e cadeiras" },
      { id: 'i2', text: "Subir as cadeiras" },
      { id: 'i3', text: "Varrer e passar pano no chão" },
      { id: 'i4', text: "Descer as cadeiras" },
      { id: 'i5', text: "Guardar mesas e cadeiras externas" },
      { id: 'i6', text: "Verificar se as janelas estão fechadas", critical: true },
      { id: 'i7', text: "Trancar a porta de acesso aos banheiros", critical: true },
      { id: 'i8', text: "Trancar as portas da frente com cadeados", critical: true, required: true, photoRequired: true },
    ],
  },
  {
    id: 't1988f366', unitId: 'ibr2', sector: "Caixa", shift: "Manhã",
    name: "Abertura (mise en place)", deadline: "09:00",
    items: [
      { id: 'i1', text: "Desligar o alarme", critical: true },
      { id: 'i2', text: "Guardar os cadeados das portas embaixo do caixa" },
      { id: 'i3', text: "Ligar o computador" },
      { id: 'i4', text: "Ligar a impressora térmica" },
      { id: 'i5', text: "Checar se as máquinas de cartão estão carregadas", critical: true },
      { id: 'i6', text: "Acender as luzes" },
      { id: 'i7', text: "Ligar o ar condicionado, quando necessário" },
      { id: 'i8', text: "Ligar o Spotify na playlist oficial IBR" },
      { id: 'i9', text: "Contar o dinheiro da gaveta do caixa", critical: true, required: true, photoRequired: true },
      { id: 'i10', text: "Abrir o caixa / sistema", critical: true, required: true, photoRequired: true },
      { id: 'i11', text: "Abrir o sistema de clube de vantagens" },
      { id: 'i12', text: "Abrir o WhatsApp da loja" },
      { id: 'i13', text: "Abastecer os pães de mandioquinha inteiros para venda na vitrine" },
      { id: 'i14', text: "Abastecer cookies para venda" },
    ],
  },
  {
    id: 't7fc87129', unitId: 'ibr2', sector: "Caixa", shift: ["Manhã", "Tarde"],
    name: "Intermediário (reposições, limpeza e manutenção)", deadline: null,
    items: [
      { id: 'i1', text: "Enviar pedido de mercado no grupo WhatsApp (para compra no dia seguinte)", recurrence: [1,3,5] },
      { id: 'i2', text: "Enviar foto da NF de compra de mercado", recurrence: [2,4,6] },
      { id: 'i3', text: "Organização e limpeza das prateleiras do caixa", recurrence: [5] },
      { id: 'i4', text: "Contagem semanal de estoque", recurrence: [6] },
      { id: 'i5', text: "Enviar foto da planilha de pedidos preenchida", recurrence: [2,4] },
    ],
  },
  {
    id: 'td4f05b74', unitId: 'ibr2', sector: "Caixa", shift: "Tarde",
    name: "Fechamento (encerramento do dia)", deadline: "18:00",
    items: [
      { id: 'i1', text: "Contar o dinheiro da gaveta do caixa", critical: true, required: true, photoRequired: true },
      { id: 'i2', text: "Fechar o caixa", critical: true, required: true, photoRequired: true },
      { id: 'i3', text: "Desligar o som" },
      { id: 'i4', text: "Desligar a TV" },
      { id: 'i5', text: "Desligar o computador" },
      { id: 'i6', text: "Checar se as máquinas de cartão estão carregando", critical: true },
      { id: 'i7', text: "Desligar a impressora" },
      { id: 'i8', text: "Desligar o ar condicionado operacional" },
      { id: 'i9', text: "Desligar o ar condicionado da lojinha" },
      { id: 'i10', text: "Desligar o ar condicionado do salão" },
    ],
  },
  {
    id: 't12f6c396', unitId: 'ibr2', sector: "Praça de Bebidas", shift: "Manhã",
    name: "Abertura (mise en place)", deadline: "09:00",
    items: [
      { id: 'i1', text: "Conferir a máquina de espresso ligada e com pressão", critical: true },
      { id: 'i2', text: "Regular o moinho / café espresso" },
      { id: 'i3', text: "Verificar o moinho de filtrados e coados" },
      { id: 'i4', text: "Verificar o blender (liquidificador)" },
      { id: 'i5', text: "Verificar o mixer" },
      { id: 'i6', text: "Abastecer copos e xícaras em cima da máquina de espresso" },
      { id: 'i7', text: "Conferir métodos e filtros de cafés" },
      { id: 'i8', text: "Conferir os utensílios da praça de bebidas, limpos e em estado de uso (montagem de praça)", required: true, photoRequired: true },
      { id: 'i9', text: "Repor águas, refrigerantes, leites e caldas" },
      { id: 'i10', text: "Checar qualidade do chantilly e preparar mais se necessário" },
      { id: 'i11', text: "Abastecer potes de insumos do bar" },
    ],
  },
  {
    id: 'tb0de97e5', unitId: 'ibr2', sector: "Praça de Bebidas", shift: ["Manhã", "Tarde"],
    name: "Intermediário (reposições, limpeza e manutenção)", deadline: null,
    items: [
      { id: 'i1', text: "Limpeza do moinho de cafés coados", recurrence: [2,4] },
      { id: 'i2', text: "Descongelamento e limpeza do freezer da praça de bebidas", recurrence: [4] },
      { id: 'i3', text: "Limpeza dos difusores da máquina de espresso", recurrence: [1,3,5] },
      { id: 'i4', text: "Limpeza dos porta-filtros da máquina de espresso", recurrence: [1,3,5] },
      { id: 'i5', text: "Organização e limpeza de armários e prateleiras da praça de bebidas", recurrence: [5] },
      { id: 'i6', text: "Organização de insumos e checagem de validades — primeiro que entra, primeiro que sai", recurrence: [5] },
      { id: 'i7', text: "Verificar se as embalagens para viagem estão abastecidas" },
    ],
  },
  {
    id: 't15df1f1b', unitId: 'ibr2', sector: "Praça de Bebidas", shift: "Tarde",
    name: "Fechamento (encerramento do dia)", deadline: "18:00",
    items: [
      { id: 'i1', text: "Limpar a máquina de espresso e desligar", critical: true },
      { id: 'i2', text: "Colocar os porta-filtros no lugar" },
      { id: 'i3', text: "Desligar os moinhos" },
      { id: 'i4', text: "Desligar e limpar liquidificadores e blenders" },
      { id: 'i5', text: "Desligar e limpar o mixer" },
      { id: 'i6', text: "Reabastecer xícaras e pires sobre a máquina" },
      { id: 'i7', text: "Recolocar os utensílios de bar" },
      { id: 'i8', text: "Esvaziar e limpar a gaveta de borras" },
      { id: 'i9', text: "Limpar as bancadas" },
      { id: 'i10', text: "Varrer e lavar o chão" },
    ],
  },
  {
    id: 'tb42a5333', unitId: 'ibr2', sector: "Praça de Alimentos", shift: "Manhã",
    name: "Abertura (mise en place)", deadline: "09:00",
    items: [
      { id: 'i1', text: "Ligar a máquina de lavar louças" },
      { id: 'i2', text: "Verificar a sanduicheira" },
      { id: 'i3', text: "Verificar o fogão" },
      { id: 'i4', text: "Aquecer água com vinagre e sal para ovo poché" },
      { id: 'i5', text: "Conferir os utensílios da praça de alimentos, limpos e em estado de uso (montagem de praça)", required: true, photoRequired: true },
      { id: 'i6', text: "Verificar máquinas de waffle limpas e funcionando" },
      { id: 'i7', text: "Checar etiquetas de validade", critical: true },
      { id: 'i8', text: "Limpar, abastecer e organizar a vitrine" },
      { id: 'i9', text: "Higienizar balcões e ilhas com álcool 70" },
      { id: 'i10', text: "Preparar e abastecer massas de waffle (tradicional e parmesão)" },
      { id: 'i11', text: "Abastecer na ilha louças, tábuas e papéis antigordura" },
      { id: 'i12', text: "Higienizar, ensacar e reabastecer talheres" },
    ],
  },
  {
    id: 'tf9e64754', unitId: 'ibr2', sector: "Praça de Alimentos", shift: ["Manhã", "Tarde"],
    name: "Intermediário (reposições, limpeza e manutenção)", deadline: null,
    items: [
      { id: 'i1', text: "Repor base de ovos: bater, etiquetar e guardar" },
      { id: 'i2', text: "Repor pães fatiados nas caixas de serviço: Levain, Mandioquinha e Leite" },
      { id: 'i3', text: "Checar itens a descongelar na geladeira para o dia seguinte: molhos, cremes e frios" },
      { id: 'i4', text: "Repor manga de Nutella, se necessário" },
      { id: 'i5', text: "Checar qualidade das frutas e realizar porcionamentos, se necessário" },
      { id: 'i6', text: "Checar necessidade de reposições conforme estoques mínimos e lançar na planilha de pedidos", critical: true },
      { id: 'i7', text: "Repor mamão fatiado na caixa de serviço" },
      { id: 'i8', text: "Repor manga cortada pela metade, com corte quadriculado, sem retirar da casca" },
      { id: 'i9', text: "Limpeza da coifa / depurador", recurrence: [1] },
      { id: 'i10', text: "Limpeza de geladeiras", recurrence: [1,3] },
      { id: 'i11', text: "Limpeza de forno", recurrence: [1,3] },
      { id: 'i12', text: "Limpeza de micro-ondas", recurrence: [1,3] },
      { id: 'i13', text: "Limpeza de prateleiras da praça de alimentos", recurrence: [1,3,5] },
      { id: 'i14', text: "Descongelamento e limpeza do freezer da praça de alimentos", recurrence: [5] },
      { id: 'i15', text: "Organização de insumos e checagem de validades — primeiro que entra, primeiro que sai", recurrence: [5] },
      { id: 'i16', text: "Limpar a vitrine", recurrence: [6] },
      { id: 'i17', text: "Verificar se as embalagens para viagem estão abastecidas" },
      { id: 'i18', text: "Preparar e abastecer massas de waffle (tradicional e parmesão)", recurrence: [1,3] },
      { id: 'i19', text: "Cortar e abastecer pães" },
    ],
  },
  {
    id: 't0f6daec1', unitId: 'ibr2', sector: "Praça de Alimentos", shift: "Tarde",
    name: "Fechamento (encerramento do dia)", deadline: "18:00",
    items: [
      { id: 'i1', text: "Finalizar a lavagem de louças" },
      { id: 'i2', text: "Higienizar e ensacar talheres" },
      { id: 'i3', text: "Desligar o forno" },
      { id: 'i4', text: "Desligar o fogão" },
      { id: 'i5', text: "Desligar e limpar as máquinas de waffle" },
      { id: 'i6', text: "Desligar e limpar a sanduicheira" },
      { id: 'i7', text: "Lavar e organizar as assadeiras" },
      { id: 'i8', text: "Limpar a vitrine e desligar a luz" },
      { id: 'i9', text: "Limpar e higienizar o balcão e a ilha" },
      { id: 'i10', text: "Guardar insumos da bancada" },
      { id: 'i11', text: "Desligar e limpar a máquina de lavar louças" },
      { id: 'i12', text: "Retirar os lixos e recolocar sacos" },
      { id: 'i13', text: "Limpar a pia e retirar o lixo do ralinho" },
      { id: 'i14', text: "Limpar as bancadas" },
      { id: 'i15', text: "Varrer e lavar o chão" },
    ],
  },
];



const IBR3_TEMPLATES = [
  {
    id: 'te153fed3', unitId: 'ibr3', sector: "Salão", shift: "Manhã",
    name: "Abertura (mise en place)", deadline: "09:00",
    items: [
      { id: 'i1', text: "Limpar e organizar as mesas, cadeiras e balcão" },
      { id: 'i2', text: "Limpar o chão do salão" },
      { id: 'i3', text: "Colocar as mesas e cadeiras da área externa no corredor" },
      { id: 'i4', text: "Limpar os trilhos das janelas na área das mesas externas" },
      { id: 'i5', text: "Varrer o chão da área externa" },
      { id: 'i6', text: "Limpar e organizar o porta-guarda-chuvas" },
      { id: 'i7', text: "Destrancar as portas e virar as placas para Open (8:00)", critical: true },
      { id: 'i8', text: "Reabastecer galheteiros" },
    ],
  },
  {
    id: 't76509ef0', unitId: 'ibr3', sector: "Salão", shift: ["Manhã", "Tarde"],
    name: "Intermediário (reposições, limpeza e manutenção)", deadline: null,
    items: [
      { id: 'i1', text: "Limpeza de vidros" },
      { id: 'i2', text: "Aguar as plantas" },
      { id: 'i3', text: "Limpar e reorganizar a lojinha", recurrence: [1,3] },
      { id: 'i4', text: "Checar e trocar QR codes das mesas, se necessário", recurrence: [2,4] },
      { id: 'i5', text: "Higienizar canecas de centro de mesa", recurrence: [2,4] },
      { id: 'i6', text: "Limpar trilhos das janelas", recurrence: [4] },
      { id: 'i7', text: "Lavar lixeiras", recurrence: [3] },
      { id: 'i8', text: "Lavar bandejas" },
      { id: 'i9', text: "Abastecer na ilha louças, tábuas e papéis antigordura" },
      { id: 'i10', text: "Limpar e abastecer talheres ensacados" },
    ],
  },
  {
    id: 'tbcb90cef', unitId: 'ibr3', sector: "Salão", shift: "Tarde",
    name: "Fechamento (encerramento do dia)", deadline: "18:00",
    items: [
      { id: 'i1', text: "Limpar mesas e cadeiras" },
      { id: 'i2', text: "Subir as cadeiras" },
      { id: 'i3', text: "Varrer e passar pano no chão" },
      { id: 'i4', text: "Descer as cadeiras" },
      { id: 'i5', text: "Guardar mesas e cadeiras externas" },
      { id: 'i6', text: "Verificar se as janelas estão fechadas", critical: true },
      { id: 'i7', text: "Trancar a porta de acesso aos banheiros", critical: true },
      { id: 'i8', text: "Trancar as portas da frente com cadeados", critical: true, required: true, photoRequired: true },
    ],
  },
  {
    id: 't31de08e5', unitId: 'ibr3', sector: "Caixa", shift: "Manhã",
    name: "Abertura (mise en place)", deadline: "09:00",
    items: [
      { id: 'i1', text: "Desligar o alarme", critical: true },
      { id: 'i2', text: "Guardar os cadeados das portas embaixo do caixa" },
      { id: 'i3', text: "Ligar o computador" },
      { id: 'i4', text: "Ligar a impressora térmica" },
      { id: 'i5', text: "Checar se as máquinas de cartão estão carregadas", critical: true },
      { id: 'i6', text: "Acender as luzes" },
      { id: 'i7', text: "Ligar o ar condicionado, quando necessário" },
      { id: 'i8', text: "Ligar o Spotify na playlist oficial IBR" },
      { id: 'i9', text: "Contar o dinheiro da gaveta do caixa", critical: true, required: true, photoRequired: true },
      { id: 'i10', text: "Abrir o caixa / sistema", critical: true, required: true, photoRequired: true },
      { id: 'i11', text: "Abrir o sistema de clube de vantagens" },
      { id: 'i12', text: "Abrir o WhatsApp da loja" },
      { id: 'i13', text: "Abastecer os pães de mandioquinha inteiros para venda na vitrine" },
      { id: 'i14', text: "Abastecer cookies para venda" },
    ],
  },
  {
    id: 'ta6e35b25', unitId: 'ibr3', sector: "Caixa", shift: ["Manhã", "Tarde"],
    name: "Intermediário (reposições, limpeza e manutenção)", deadline: null,
    items: [
      { id: 'i1', text: "Enviar pedido de mercado no grupo WhatsApp (para compra no dia seguinte)", recurrence: [1,3,5] },
      { id: 'i2', text: "Enviar foto da NF de compra de mercado", recurrence: [2,4,6] },
      { id: 'i3', text: "Organização e limpeza das prateleiras do caixa", recurrence: [5] },
      { id: 'i4', text: "Contagem semanal de estoque", recurrence: [6] },
      { id: 'i5', text: "Enviar foto da planilha de pedidos preenchida", recurrence: [2,4] },
    ],
  },
  {
    id: 't431af6da', unitId: 'ibr3', sector: "Caixa", shift: "Tarde",
    name: "Fechamento (encerramento do dia)", deadline: "18:00",
    items: [
      { id: 'i1', text: "Contar o dinheiro da gaveta do caixa", critical: true, required: true, photoRequired: true },
      { id: 'i2', text: "Fechar o caixa", critical: true, required: true, photoRequired: true },
      { id: 'i3', text: "Desligar o som" },
      { id: 'i4', text: "Desligar a TV" },
      { id: 'i5', text: "Desligar o computador" },
      { id: 'i6', text: "Checar se as máquinas de cartão estão carregando", critical: true },
      { id: 'i7', text: "Desligar a impressora" },
      { id: 'i8', text: "Desligar o ar condicionado operacional" },
      { id: 'i9', text: "Desligar o ar condicionado da lojinha" },
      { id: 'i10', text: "Desligar o ar condicionado do salão" },
    ],
  },
  {
    id: 'tba58145d', unitId: 'ibr3', sector: "Praça de Bebidas", shift: "Manhã",
    name: "Abertura (mise en place)", deadline: "09:00",
    items: [
      { id: 'i1', text: "Conferir a máquina de espresso ligada e com pressão", critical: true },
      { id: 'i2', text: "Regular o moinho / café espresso" },
      { id: 'i3', text: "Verificar o moinho de filtrados e coados" },
      { id: 'i4', text: "Verificar o blender (liquidificador)" },
      { id: 'i5', text: "Verificar o mixer" },
      { id: 'i6', text: "Abastecer copos e xícaras em cima da máquina de espresso" },
      { id: 'i7', text: "Conferir métodos e filtros de cafés" },
      { id: 'i8', text: "Conferir os utensílios da praça de bebidas, limpos e em estado de uso (montagem de praça)", required: true, photoRequired: true },
      { id: 'i9', text: "Repor águas, refrigerantes, leites e caldas" },
      { id: 'i10', text: "Checar qualidade do chantilly e preparar mais se necessário" },
      { id: 'i11', text: "Abastecer potes de insumos do bar" },
    ],
  },
  {
    id: 't91b88f40', unitId: 'ibr3', sector: "Praça de Bebidas", shift: ["Manhã", "Tarde"],
    name: "Intermediário (reposições, limpeza e manutenção)", deadline: null,
    items: [
      { id: 'i1', text: "Limpeza do moinho de cafés coados", recurrence: [2,4] },
      { id: 'i2', text: "Descongelamento e limpeza do freezer da praça de bebidas", recurrence: [4] },
      { id: 'i3', text: "Limpeza dos difusores da máquina de espresso", recurrence: [1,3,5] },
      { id: 'i4', text: "Limpeza dos porta-filtros da máquina de espresso", recurrence: [1,3,5] },
      { id: 'i5', text: "Organização e limpeza de armários e prateleiras da praça de bebidas", recurrence: [5] },
      { id: 'i6', text: "Organização de insumos e checagem de validades — primeiro que entra, primeiro que sai", recurrence: [5] },
      { id: 'i7', text: "Verificar se as embalagens para viagem estão abastecidas" },
    ],
  },
  {
    id: 'tcc03b13b', unitId: 'ibr3', sector: "Praça de Bebidas", shift: "Tarde",
    name: "Fechamento (encerramento do dia)", deadline: "18:00",
    items: [
      { id: 'i1', text: "Limpar a máquina de espresso e desligar", critical: true },
      { id: 'i2', text: "Colocar os porta-filtros no lugar" },
      { id: 'i3', text: "Desligar os moinhos" },
      { id: 'i4', text: "Desligar e limpar liquidificadores e blenders" },
      { id: 'i5', text: "Desligar e limpar o mixer" },
      { id: 'i6', text: "Reabastecer xícaras e pires sobre a máquina" },
      { id: 'i7', text: "Recolocar os utensílios de bar" },
      { id: 'i8', text: "Esvaziar e limpar a gaveta de borras" },
      { id: 'i9', text: "Limpar as bancadas" },
      { id: 'i10', text: "Varrer e lavar o chão" },
    ],
  },
  {
    id: 't884d369a', unitId: 'ibr3', sector: "Praça de Alimentos", shift: "Manhã",
    name: "Abertura (mise en place)", deadline: "09:00",
    items: [
      { id: 'i1', text: "Ligar a máquina de lavar louças" },
      { id: 'i2', text: "Verificar a sanduicheira" },
      { id: 'i3', text: "Verificar o fogão" },
      { id: 'i4', text: "Aquecer água com vinagre e sal para ovo poché" },
      { id: 'i5', text: "Conferir os utensílios da praça de alimentos, limpos e em estado de uso (montagem de praça)", required: true, photoRequired: true },
      { id: 'i6', text: "Verificar máquinas de waffle limpas e funcionando" },
      { id: 'i7', text: "Checar etiquetas de validade", critical: true },
      { id: 'i8', text: "Limpar, abastecer e organizar a vitrine" },
      { id: 'i9', text: "Higienizar balcões e ilhas com álcool 70" },
      { id: 'i10', text: "Preparar e abastecer massas de waffle (tradicional e parmesão)" },
      { id: 'i11', text: "Abastecer na ilha louças, tábuas e papéis antigordura" },
      { id: 'i12', text: "Higienizar, ensacar e reabastecer talheres" },
    ],
  },
  {
    id: 't16584e68', unitId: 'ibr3', sector: "Praça de Alimentos", shift: ["Manhã", "Tarde"],
    name: "Intermediário (reposições, limpeza e manutenção)", deadline: null,
    items: [
      { id: 'i1', text: "Repor base de ovos: bater, etiquetar e guardar" },
      { id: 'i2', text: "Repor pães fatiados nas caixas de serviço: Levain, Mandioquinha e Leite" },
      { id: 'i3', text: "Checar itens a descongelar na geladeira para o dia seguinte: molhos, cremes e frios" },
      { id: 'i4', text: "Repor manga de Nutella, se necessário" },
      { id: 'i5', text: "Checar qualidade das frutas e realizar porcionamentos, se necessário" },
      { id: 'i6', text: "Checar necessidade de reposições conforme estoques mínimos e lançar na planilha de pedidos", critical: true },
      { id: 'i7', text: "Repor mamão fatiado na caixa de serviço" },
      { id: 'i8', text: "Repor manga cortada pela metade, com corte quadriculado, sem retirar da casca" },
      { id: 'i9', text: "Limpeza da coifa / depurador", recurrence: [1] },
      { id: 'i10', text: "Limpeza de geladeiras", recurrence: [1,3] },
      { id: 'i11', text: "Limpeza de forno", recurrence: [1,3] },
      { id: 'i12', text: "Limpeza de micro-ondas", recurrence: [1,3] },
      { id: 'i13', text: "Limpeza de prateleiras da praça de alimentos", recurrence: [1,3,5] },
      { id: 'i14', text: "Descongelamento e limpeza do freezer da praça de alimentos", recurrence: [5] },
      { id: 'i15', text: "Organização de insumos e checagem de validades — primeiro que entra, primeiro que sai", recurrence: [5] },
      { id: 'i16', text: "Limpar a vitrine", recurrence: [6] },
      { id: 'i17', text: "Verificar se as embalagens para viagem estão abastecidas" },
      { id: 'i18', text: "Preparar e abastecer massas de waffle (tradicional e parmesão)", recurrence: [1,3] },
      { id: 'i19', text: "Cortar e abastecer pães" },
    ],
  },
  {
    id: 'tbc72a748', unitId: 'ibr3', sector: "Praça de Alimentos", shift: "Tarde",
    name: "Fechamento (encerramento do dia)", deadline: "18:00",
    items: [
      { id: 'i1', text: "Finalizar a lavagem de louças" },
      { id: 'i2', text: "Higienizar e ensacar talheres" },
      { id: 'i3', text: "Desligar o forno" },
      { id: 'i4', text: "Desligar o fogão" },
      { id: 'i5', text: "Desligar e limpar as máquinas de waffle" },
      { id: 'i6', text: "Desligar e limpar a sanduicheira" },
      { id: 'i7', text: "Lavar e organizar as assadeiras" },
      { id: 'i8', text: "Limpar a vitrine e desligar a luz" },
      { id: 'i9', text: "Limpar e higienizar o balcão e a ilha" },
      { id: 'i10', text: "Guardar insumos da bancada" },
      { id: 'i11', text: "Desligar e limpar a máquina de lavar louças" },
      { id: 'i12', text: "Retirar os lixos e recolocar sacos" },
      { id: 'i13', text: "Limpar a pia e retirar o lixo do ralinho" },
      { id: 'i14', text: "Limpar as bancadas" },
      { id: 'i15', text: "Varrer e lavar o chão" },
    ],
  },
];


export function generateSeedTemplates() {
  const templates = [];
  UNITS.forEach(u => {
    if (u.id === 'ibr2' || u.id === 'ibr3') return; // IBR2 and IBR3 use real checklists defined below.
    u.sectors.forEach(sector => {
      const category = SECTOR_CATEGORY[sector];
      CHECKLIST_TYPES.forEach(ct => {
        templates.push({
          id: 't' + (u.id + sector + ct.name).split('').reduce((a,c)=>((a<<5)-a+c.charCodeAt(0))|0,0).toString(16).replace('-','').slice(0,8),
          unitId: u.id,
          sector,
          shift: ct.shift,
          name: ct.name,
          deadline: ct.deadline,
          items: ITEM_LIBRARY[category][ct.key].map((item, idx) => ({
            id: `i${idx + 1}`,
            text: item.text,
            critical: !!item.critical,
            required: !!item.required,
            photoRequired: !!item.photoRequired,
          })),
        });
      });
    });
  });
  templates.push(...IBR2_TEMPLATES);
  templates.push(...IBR3_TEMPLATES);
  return templates;
}

const SEED_TEMPLATES = generateSeedTemplates();


// `matchesShift`, `isItemApplicable` e `applicableItems` moraram aqui até a
// Fase 1a; agora vêm de lib/checklists.js (ver o import no topo).
const shiftLabel = t => Array.isArray(t.shift) ? t.shift.join(' e ') : t.shift;


// Recurrence: undefined/null/empty = every day. Otherwise an array of weekday numbers (0=Dom ... 6=Sáb).
const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

// Generates ~7 days of realistic-looking completion history (for testing the Relatórios tab).
export function generateSimulatedCompletions(templates, users, days = 7) {
  const completions = [];
  for (let offset = days - 1; offset >= 0; offset--) {
    const dateStr = daysAgoStr(offset);
    const weekday = weekdayOf(dateStr);

    templates.forEach(t => {
      const items = t.items.filter(i => isItemApplicable(i, dateStr));
      if (items.length === 0) return;

      const shiftNames = Array.isArray(t.shift) ? t.shift : [t.shift];
      const shiftName = shiftNames[offset % shiftNames.length];
      const candidates = users.filter(u => u.unitId === t.unitId && u.role === 'colaborador' && u.name.includes(shiftName));
      const operator = candidates.length
        ? candidates[(offset + t.id.length) % candidates.length]
        : (users.find(u => u.unitId === t.unitId && u.role === 'colaborador') || users[0]);

      const baseHour = shiftName === 'Manhã' ? 8.5 : shiftName === 'Tarde' ? 17.5 : 14;
      // `new Date(d)` — `d` nunca existiu, então gerar dados de teste lançava
      // ReferenceError na primeira iteração. Achado pelo `no-undef` em
      // 10/08/2026; o build compilava isto sem reclamar desde sempre.
      //
      // `T12:00:00` e não só `dateStr`: `new Date('2026-08-10')` é meia-noite
      // UTC, que no Brasil é dia 9 às 21h — e o setHours abaixo cairia no dia
      // ERRADO. Meio-dia local mantém a data qualquer que seja o fuso.
      const startedAt = new Date(`${dateStr}T12:00:00`);
      startedAt.setHours(Math.floor(baseHour), Math.floor(Math.random() * 30), 0, 0);
      const spanMin = 10 + Math.random() * 50; // execução de ~10 a 60 min

      const recordItems = items.map((i, idx) => {
        const p = i.critical ? 0.92 : 0.85;
        const done = Math.random() < p;
        const doneAt = done ? new Date(startedAt.getTime() + ((idx + 1) / items.length) * spanMin * 60000) : null;
        return {
          id: i.id, critical: !!i.critical, required: !!i.required, done, note: '', hasPhoto: !!i.photoRequired && done,
          doneBy: done ? operator.id : null, doneByName: done ? operator.name : null,
          doneAt: doneAt ? doneAt.toISOString() : null,
        };
      });

      const completedAt = new Date(startedAt.getTime() + spanMin * 60000);

      completions.push({
        id: uid(), templateId: t.id, templateName: t.name, unitId: t.unitId, sector: t.sector,
        shift: shiftLabel(t), date: dateStr, completedAt: completedAt.toISOString(),
        operatorName: operator.name, operatorUserId: operator.id, items: recordItems,
      });
    });
  }
  return completions;
}

/**
 * Cola os vereditos da liderança nos itens das execuções, em memória.
 *
 * Por que anexar em vez de passar um Map adiante: `item.review` faz TODO
 * consumidor de completions enxergar o veredito sem mudar assinatura —
 * `computeOperationalProfile`, o ranking, o modal de conferência e o briefing.
 * O preço é lembrar de tirá-lo antes de gravar, e é o que `pushCompletion` faz.
 *
 * A fonte da verdade continua sendo a tabela `task_reviews`; isto é projeção.
 */
function annotateReviews(completions, taskReviews, completionNotes) {
  if (!taskReviews?.length && !completionNotes?.length) return completions || [];
  const byKey = new Map((taskReviews || []).map(r => [`${r.completionId}|${r.itemId}`, r]));
  // A nota do checklist inteiro volta para o mesmo campo de sempre
  // (`reviewNote`), só que agora vinda da RPC em vez da coluna pública. Nenhum
  // consumidor precisou mudar — o ReviewModal e o briefing seguem lendo `c.reviewNote`.
  const notaDe = new Map((completionNotes || []).map(n => [n.completionId, n]));
  return (completions || []).map(c => ({
    ...c,
    reviewNote: notaDe.get(c.id)?.note ?? c.reviewNote ?? null,
    reviewedByName: c.reviewedByName ?? notaDe.get(c.id)?.reviewedByName ?? null,
    items: (c.items || []).map(i => {
      const r = byKey.get(`${c.id}|${i.id}`);
      // `executedBy` viaja junto porque é ele que decide DE QUEM é este
      // feedback. Sem ele, o briefing tinha que perguntar ao checklist quem era
      // o dono — e o checklist só sabe quem o submeteu.
      //
      // `comMotivo` e `reviewedAt` alimentam a pontuação de qualidade: mudo não
      // pontua, e a régua só vale para julgamentos feitos a partir do corte.
      return r ? { ...i, review: { verdict: r.verdict, note: r.note, byName: r.reviewedByName, executedBy: r.executedByUserId, comMotivo: r.comMotivo ?? !!r.note, reviewedAt: r.reviewedAt } } : i;
    }),
  }));
}


// Resizes and compresses an image file to a small JPEG data URL for proof-of-task photos.
function compressImage(file, maxDim = 640, quality = 0.6) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDim) { height = Math.round(height * (maxDim / width)); width = maxDim; }
        else if (height >= width && height > maxDim) { width = Math.round(width * (maxDim / height)); height = maxDim; }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}




/* ------------------------------ small atoms ------------------------------ */



/* Toast global de confirmação — visível de qualquer scroll/tela, ao contrário
   das mensagens inline que ficavam fora da área visível. Qualquer fluxo chama
   showToast('Loja criada!') e o ToastHost (montado no App) exibe por 2,6s. */
function showToast(msg) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('zcheck-toast', { detail: msg }));
}

function ToastHost() {
  const [msg, setMsg] = useState('');
  useEffect(() => {
    let t;
    const h = (e) => { setMsg(e.detail); clearTimeout(t); t = setTimeout(() => setMsg(''), 2600); };
    window.addEventListener('zcheck-toast', h);
    return () => { window.removeEventListener('zcheck-toast', h); clearTimeout(t); };
  }, []);
  if (!msg) return null;
  return (
    <div className="zc-overlay-center" style={{
      position: 'fixed', left: '50%', transform: 'translateX(-50%)',
      bottom: 'calc(var(--zc-nav-h) + 16px + env(safe-area-inset-bottom, 0px))', zIndex: 400,
      display: 'flex', alignItems: 'center', gap: 8, maxWidth: 'calc(100vw - 32px)',
      background: '#E8F4F0', border: `1px solid ${C.success}`, borderRadius: R.pill,
      padding: '10px 16px', boxShadow: '0 4px 16px rgba(8,20,30,0.18)',
    }}>
      <CheckCircle2 size={16} color={C.success} style={{ flexShrink: 0 }} />
      <p style={{ fontSize: 13, fontWeight: W.semibold, color: C.success, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{msg}</p>
    </div>
  );
}






function BackBar({ onBack, label, accent, motiv }) {
  return (
    <div className="flex items-center justify-between mb-4 gap-3">
      <button
        onClick={onBack}
        className="flex items-center gap-2"
        style={{
          background: 'white',
          border: `1.5px solid ${C.border}`,
          borderRadius: R.sm,
          padding: '10px 16px',
          fontWeight: W.semibold,
          fontSize: T.bodySm,
          color: C.ink,
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        <ArrowLeft size={18} color={accent} />
        <span>{label}</span>
      </button>
      {motiv && (
        <p style={{ fontSize: T.caption, fontWeight: W.semibold, color: accent, textAlign: 'right', lineHeight: 1.3 }}>{motiv}</p>
      )}
    </div>
  );
}



/* ------------------------------ item row ---------------------------------- */

// Converte URLs comuns do YouTube (watch, youtu.be, shorts, live) em URL de embed.
// Retorna null para qualquer outro link — nesse caso mostramos só o botão.
function youtubeEmbedUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    let id = null;
    if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
    else if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
      if (u.pathname === '/watch') id = u.searchParams.get('v');
      else if (/^\/(shorts|live|embed)\//.test(u.pathname)) id = u.pathname.split('/')[2];
    }
    return id && /^[\w-]{6,20}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  } catch { return null; }
}

// Abre um documento de referência (POP) via signed URL do storage.
function RefDocButton({ doc, accent }) {
  const [loading, setLoading] = useState(false);
  const open = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const url = await getRefDocUrl(doc.path);
      if (url) window.open(url, '_blank', 'noopener');
    } catch (e) { console.warn('getRefDocUrl failed', e); }
    setLoading(false);
  };
  return (
    <button onClick={open}
      className="flex items-center gap-2"
      style={{ fontSize: 13, fontWeight: W.semibold, color: accent, background: `${accent}12`, borderRadius: 8, border: `1px solid ${accent}30`, padding: '8px 12px', cursor: 'pointer', maxWidth: '100%' }}>
      <FileText size={14} style={{ flexShrink: 0 }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{loading ? 'Abrindo…' : doc.name}</span>
    </button>
  );
}

// Um item tem material de apoio quando a gestão cadastrou qualquer referência.
const hasGuidance = item =>
  !!(item.description || item.refPhotos?.length > 0 || item.refDocs?.length > 0 || item.refVideo || item.refLink);

function ItemRow({ item, state, accent, locked, onToggle, onNote, onPhoto, liveInfo, onReopen, currentUserId }) {
  const fileInputRef = useRef(null);
  const [showDesc, setShowDesc] = useState(false);
  const [expandedPhoto, setExpandedPhoto] = useState(null);
  // Estado colaborativo: item concluído no estado compartilhado (por mim ou por colega).
  const collabDone = !!liveInfo?.done;
  const byOther = collabDone && liveInfo.operatorUserId && liveInfo.operatorUserId !== currentUserId;
  const effDone = state.done || collabDone;
  const lineColor = locked ? C.mutedLight : effDone ? C.success : item.critical ? C.critical : accent;
  // Foto que o colega já anexou nesta rodada — vale como a minha para liberar o
  // item e o fechamento do checklist.
  const fotoDaRodada = liveInfo?.photoPath || null;
  const needsPhoto = item.photoRequired && !state.photo && !fotoDaRodada && !collabDone;

  // A foto do colega precisa ser VISTA, não só anunciada. Antes daqui a rodada
  // dizia "Foto anexada nesta rodada" e pronto: quem ia fechar o checklist
  // assinava por uma prova que não tinha como olhar. A URL é assinada e expira,
  // então é resolvida na hora em que o item aparece, não guardada em lugar nenhum.
  const [urlDaRodada, setUrlDaRodada] = useState(null);
  useEffect(() => {
    let vivo = true;
    if (!fotoDaRodada) { setUrlDaRodada(null); return; }
    getRoundPhotoUrl(fotoDaRodada).then(u => { if (vivo) setUrlDaRodada(u); });
    return () => { vivo = false; };
  }, [fotoDaRodada]);

  return (
    <>
      <Ticket accent={lineColor}>
      {/* Esmaecido = não há o que fazer aqui: travado pelo item obrigatório
          anterior, feito pelo colega na rodada, ou já registrado hoje. */}
      <div className="flex items-start gap-3" style={{ opacity: locked ? 0.5 : (byOther || liveInfo?.submitted) ? 0.6 : 1 }}>
        <button
          onClick={onToggle}
          disabled={locked}
          // padding compensado por margin negativa: alvo de toque ≥44px sem mover o layout
          style={{ background: 'none', border: 'none', padding: 10, margin: '-9px -10px -10px', flexShrink: 0, cursor: locked ? 'not-allowed' : 'pointer' }}
        >
          {effDone
            ? <CheckCircle2 size={24} color={C.success} />
            : <Circle size={24} color={C.mutedLight} />}
        </button>
        <div className="flex-1" style={{ minWidth: 0 }}>
          <div className="flex items-start justify-between gap-2">
            <p style={{ fontSize: T.body, fontWeight: W.medium, color: effDone ? C.muted : C.ink, textDecoration: effDone ? 'line-through' : 'none', flex: 1 }}>
              {item.text}
            </p>
            {hasGuidance(item) && (
              <button
                onClick={() => setShowDesc(v => !v)}
                style={{ fontSize: T.label, fontWeight: W.semibold, color: accent, background: 'none', border: `1px solid ${accent}`, borderRadius: R.pill, padding: '3px 10px', flexShrink: 0, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                {showDesc ? 'Ver menos' : 'Ver mais'}
              </button>
            )}
          </div>

          {/* Arrastada de um dia anterior. O carimbo diz DESDE QUANDO: sem ele
              a linha se confunde com a rotina do dia, e o atraso — que é a
              única razão de ela estar aqui — some da percepção de quem
              executa. Também é o que o turno da manhã lê para saber que a
              noite deixou passar, sem precisar de tela de gestão. */}
          {item.carriedFrom && (
            <p style={{ marginTop: 4, fontSize: T.label, fontWeight: W.semibold, color: C.critical, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Clock size={12} aria-hidden />
              Pendente desde {ddmm(item.carriedFrom)}
              {item.diasArrastado > 1 ? ` · ${item.diasArrastado} dias` : ''}
            </p>
          )}

          {showDesc && hasGuidance(item) && (
            <div style={{ marginTop: 8, padding: '10px 12px', background: C.bg, borderRadius: 8, border: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {item.description && (
                <p style={{ fontSize: T.bodySm, color: C.ink, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{item.description}</p>
              )}
              {item.refPhotos?.length > 0 && (
                <div>
                  <p style={{ fontSize: T.label, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted, marginBottom: 6 }}>Referências</p>
                  <div className="flex flex-wrap gap-2">
                    {item.refPhotos.map((photo, pi) => (
                      <img key={pi} src={photo} alt={`ref ${pi+1}`}
                        style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: `1px solid ${C.border}`, cursor: 'pointer' }}
                        onClick={() => setExpandedPhoto(photo)}
                      />
                    ))}
                  </div>
                </div>
              )}
              {item.refVideo && (() => {
                const embed = youtubeEmbedUrl(item.refVideo);
                return (
                  <div>
                    <p style={{ fontSize: T.label, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted, marginBottom: 6 }}>Vídeo de orientação</p>
                    {embed ? (
                      <div style={{ position: 'relative', width: '100%', paddingTop: '56.25%', borderRadius: 8, overflow: 'hidden', border: `1px solid ${C.border}` }}>
                        <iframe
                          src={embed} title="Vídeo de orientação"
                          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
                          allow="accelerometer; encrypted-media; picture-in-picture" allowFullScreen
                        />
                      </div>
                    ) : (
                      <a href={item.refVideo} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2"
                        style={{ fontSize: 13, fontWeight: W.semibold, color: accent, textDecoration: 'none', padding: '8px 12px', background: `${accent}12`, borderRadius: 8, border: `1px solid ${accent}30`, width: 'fit-content' }}>
                        <PlayCircle size={14} /> Assistir vídeo
                      </a>
                    )}
                  </div>
                );
              })()}
              {item.refDocs?.length > 0 && (
                <div>
                  <p style={{ fontSize: T.label, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted, marginBottom: 6 }}>Documentos (POP)</p>
                  <div className="flex flex-wrap gap-2">
                    {item.refDocs.map((doc, di) => <RefDocButton key={di} doc={doc} accent={accent} />)}
                  </div>
                </div>
              )}
              {item.refLink && (
                <a href={item.refLink} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2"
                  style={{ fontSize: 13, fontWeight: W.semibold, color: accent, textDecoration: 'none', padding: '8px 12px', background: `${accent}12`, borderRadius: 8, border: `1px solid ${accent}30`, width: 'fit-content' }}
                >
                  <ExternalLink size={14} /> Abrir material de referência
                </a>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2 mt-1">
            {item.critical && (
              <span className="flex items-center gap-1" style={{ fontSize: T.label, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.critical }}>
                <AlertTriangle size={12} /> Crítico
              </span>
            )}
            {item.required && (
              <span className="flex items-center gap-1" style={{ fontSize: T.label, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.1em', color: accent }}>
                <Lock size={12} /> Obrigatório
              </span>
            )}
            {item.photoRequired && (
              <span className="flex items-center gap-1" style={{ fontSize: T.label, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.1em', color: accent }}>
                <Camera size={12} /> Foto
              </span>
            )}
            {item.recurrence && item.recurrence.length > 0 && (
              <span className="flex items-center gap-1" style={{ fontSize: T.label, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.muted }}>
                <Clock size={12} /> {item.recurrence.map(d => WEEKDAY_LABELS[d]).join('/')}
              </span>
            )}
          </div>

          {locked && (
            <p className="flex items-center gap-1 mt-1" style={{ fontSize: T.caption, fontWeight: W.medium, color: C.muted }}>
              <Lock size={11} /> Conclua o item obrigatório anterior para liberar
            </p>
          )}

          {collabDone && (
            <div className="flex items-center gap-2 mt-1" style={{ flexWrap: 'wrap' }}>
              <span className="flex items-center gap-1" style={{ fontSize: T.caption, fontWeight: W.semibold, color: C.success }}>
                <CheckCircle2 size={12} />
                {/* "Registrada" = veio de um checklist já submetido hoje; a
                    tarefa está fechada e só reabre pelo botão ao lado. */}
                {liveInfo.submitted ? 'Registrada' : 'Concluída'} por {byOther ? (liveInfo.operatorName || 'colega') : 'você'}
                {liveInfo.completedAt ? ` às ${new Date(liveInfo.completedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}
              </span>
              {onReopen && (
                <button onClick={onReopen}
                  style={{ fontSize: T.label, fontWeight: W.semibold, color: accent, background: 'none', border: `1px solid ${accent}`, borderRadius: R.pill, padding: '2px 10px', cursor: 'pointer' }}>
                  Reabrir
                </button>
              )}
            </div>
          )}

          <input
            value={state.note}
            onChange={e => onNote(e.target.value)}
            placeholder="Observação (opcional)"
            disabled={locked}
            className="mt-2 w-full px-2 py-1.5"
            style={{ fontSize: T.bodySm, background: C.bg, border: `1px solid ${C.border}`, borderRadius: R.sm, outline: 'none', color: C.ink }}
          />

          {item.photoRequired && !locked && (
            <div className="flex items-center gap-2 mt-2">
              {state.photo ? (
                <>
                  <img src={state.photo} alt="Comprovação" onClick={() => setExpandedPhoto(state.photo)}
                    style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 4, border: `1px solid ${C.border}`, cursor: 'pointer' }} />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    style={{ fontSize: T.label, fontWeight: W.semibold, color: accent, background: 'none', border: 'none', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '10px 8px', margin: '-10px -8px' }}
                  >
                    Trocar foto
                  </button>
                </>
              ) : fotoDaRodada ? (
                // Já tem prova na rodada: anexar vira opcional, não pendência.
                <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
                  {urlDaRodada ? (
                    <img src={urlDaRodada} alt="Comprovação da rodada" onClick={() => setExpandedPhoto(urlDaRodada)}
                      style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 4, border: `1px solid ${C.border}`, cursor: 'pointer' }} />
                  ) : (
                    <span className="flex items-center gap-1" style={{ fontSize: T.caption, fontWeight: W.semibold, color: C.success }}>
                      <Camera size={12} aria-hidden /> Foto anexada nesta rodada
                    </span>
                  )}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    style={{ fontSize: T.label, fontWeight: W.semibold, color: accent, background: 'none', border: `1px solid ${accent}`, borderRadius: R.pill, padding: '2px 10px', cursor: 'pointer' }}
                  >
                    Anexar outra
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1"
                  style={{ fontSize: T.label, fontWeight: W.semibold, color: C.critical, background: 'none', border: `1px dashed ${C.critical}`, borderRadius: R.sm, padding: '8px 12px', textTransform: 'uppercase', letterSpacing: '0.06em' }}
                >
                  <Camera size={12} /> Anexar foto
                </button>
              )}
              <input
                ref={fileInputRef} type="file" accept="image/*" capture="environment"
                style={{ display: 'none' }}
                onChange={e => { if (e.target.files?.[0]) onPhoto(e.target.files[0]); }}
              />
            </div>
          )}

          {needsPhoto && !state.done && !locked && (
            <p style={{ fontSize: T.caption, fontWeight: W.medium, color: C.critical, marginTop: 4 }}>
              Anexe uma foto para concluir este item.
            </p>
          )}
        </div>

        {effDone && (
          <div
            className="font-mono-ibr"
            style={{
              flexShrink: 0, transform: 'rotate(-6deg)', border: `2px solid ${C.success}`, color: C.success,
              fontSize: 10, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.1em', padding: '2px 6px', borderRadius: 4,
            }}
          >
            OK
          </div>
        )}
      </div>
    </Ticket>

    {/* Inline photo expansion modal */}
    {expandedPhoto && (
      <div
        onClick={() => setExpandedPhoto(null)}
        style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      >
        <img
          src={expandedPhoto}
          alt="Referência"
          style={{ maxWidth: '100%', maxHeight: '90vh', objectFit: 'contain', borderRadius: 8 }}
          onClick={e => e.stopPropagation()}
        />
        <button
          onClick={() => setExpandedPhoto(null)}
          style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: 36, height: 36, color: 'white', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >×</button>
      </div>
    )}
    </>
  );
}

/* ----------------------------- confirm modal ------------------------------ */

function ConfirmModal({ items, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 z-50" style={{ background: 'rgba(32,48,43,0.5)' }}>
      <div className="w-full" style={{ maxWidth: 360, background: 'white', borderRadius: R.md, padding: 16, border: `2px solid ${C.critical}` }}>
        <div className="flex items-center gap-2 mb-2" style={{ color: C.critical }}>
          <AlertTriangle size={20} />
          <h3 className="font-display" style={{ fontWeight: W.semibold }}>Itens críticos pendentes</h3>
        </div>
        <ul style={{ fontSize: T.bodySm, color: C.ink, paddingLeft: 18, marginBottom: 12 }}>
          {items.map((t, i) => <li key={i} style={{ marginBottom: 4 }}>{t}</li>)}
        </ul>
        <p style={{ fontSize: T.caption, color: C.muted, marginBottom: 12 }}>
          Você pode concluir mesmo assim, mas o painel mostrará alerta para a gestão.
        </p>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-2" style={{ borderRadius: R.sm, border: `1px solid ${C.border}`, fontWeight: W.semibold, color: C.ink, background: 'white' }}>
            Voltar
          </button>
          <button onClick={onConfirm} className="flex-1 py-2" style={{ borderRadius: R.sm, border: 'none', fontWeight: W.semibold, color: 'white', background: C.critical }}>
            Concluir assim
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------- execution screen ----------------------------- */

// Congelado fora do componente: se fosse um literal novo a cada chamada de
// `estadoDe`, o item sem estado receberia um objeto diferente por render.
const ESTADO_ITEM_VAZIO = Object.freeze({ done: false, note: '', photo: null });

// Exportado para o teste de renderização alcançar a tela de execução sem
// sessão logada (o mesmo motivo do `TemplateEditor`). Nada mais o importa.
export function ExecutionScreen({ template, unit, currentUser, completions, closures, onCancel, onComplete, onDone }) {
  const [completionRecord, setCompletionRecord] = useState(null); // shows celebration when set
  // O dia gravado na execução é o da LOJA que a executou — é ele que o prazo,
  // o relatório e a aderência usam depois.
  const today = todayStr(tzOf(unit));
  // Previstas do dia MAIS as arrastadas de dias anteriores (ver `itensDoDia`).
  // Memorizado porque a varredura de carryover olha até 7 dias para trás e esta
  // lista é lida a cada render — inclusive dentro do efeito de telemetria.
  const items = useMemo(
    () => itensDoDia(template, completions, closures, today),
    [template, completions, closures, today],
  );

  const [itemStates, setItemStates] = useState(() =>
    Object.fromEntries(items.map(i => [i.id, { done: false, note: '', photo: null }]))
  );
  /**
   * A lista pode CRESCER depois da montagem.
   *
   * `items` passou a depender de `completions`, que chega assíncrono: uma
   * tarefa arrastada aparece quando o histórico carrega, já com a tela montada.
   * O estado foi semeado uma vez só, na montagem, então esse item entra sem
   * entrada em `itemStates` — e toda leitura direta (`.done`, `.note`,
   * `.photo`) quebraria a linha. Semear por efeito não resolve: o render que
   * introduz o item acontece ANTES de o efeito rodar.
   *
   * As escritas não precisam disso porque já usam spread (`{...s[id]}`), que
   * tolera `undefined`.
   */
  const estadoDe = id => itemStates[id] || ESTADO_ITEM_VAZIO;
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');

  // Tarefas JÁ REGISTRADAS hoje neste checklist — não se executam de novo.
  // A regra (e o porquê de ela não olhar só a rodada ao vivo) está em lib/rounds.js.
  const submittedByItem = useMemo(
    () => submittedTasksFrom(completions, { templateId: template.id, unitId: unit.id, date: today }),
    [completions, template.id, unit.id, today],
  );

  // ── Execução colaborativa (H6) ─────────────────────────────────────────────
  //
  // `liveRaw` é a rodada como ela está no banco; `liveByItem` é a visão que a
  // tela usa (rodada + tarefas já registradas). Derivar em vez de guardar o
  // merge no estado importa: `completions` chega de forma assíncrona, e um merge
  // congelado no estado ficaria preso ao valor que existia na montagem —
  // tarefa registrada que carregou depois apareceria aberta e reexecutável.
  const [liveRaw, setLiveRaw] = useState({});
  const liveByItem = useMemo(() => mergeRoundState(liveRaw, submittedByItem), [liveRaw, submittedByItem]);
  const [collabNotice, setCollabNotice] = useState('');
  const [reopenTarget, setReopenTarget] = useState(null);
  const [reopenReason, setReopenReason] = useState('');
  const collabSessionTracked = useRef(false);
  // Itens com marcação em voo: sem isto, dois toques rápidos disparam duas
  // reivindicações e a segunda desfaz a primeira na volta.
  const emVoo = useRef(new Set());
  // Observações que ESTA pessoa editou. O que ela digitou não pode ser
  // sobrescrito pela nota que chega do colega no realtime.
  const notasTocadas = useRef(new Set());
  const notaTimers = useRef({});
  useEffect(() => () => Object.values(notaTimers.current).forEach(clearTimeout), []);

  const avisar = (msg) => {
    setCollabNotice(msg);
    setTimeout(() => setCollabNotice(''), 2600);
  };

  // Instrumentação do funil: início na montagem; abandono se desmontar sem
  // submit (voltar/cancelar). Fechar a aba não desmonta — esse abandono fica
  // implícito no /admin como started sem completed na mesma sessão.
  const submittedRef = useRef(false);
  const progressRef = useRef({ done: 0, total: items.length, startedAt: Date.now() });
  useEffect(() => {
    track('checklist_started', {
      source: 'checklist', checklistId: template.id, unitId: unit.id,
      metadata: { template_name: template.name, sector: template.sector, items: items.length },
    });
    return () => {
      if (submittedRef.current) return;
      const p = progressRef.current;
      track('checklist_abandoned', {
        source: 'checklist', checklistId: template.id, unitId: unit.id,
        metadata: {
          template_name: template.name, sector: template.sector,
          done: p.done, total: p.total,
          seconds: Math.round((Date.now() - p.startedAt) / 1000),
        },
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Estado efetivo de conclusão: local OU compartilhado (por um colega em tempo real).
  const effDone = id => estadoDe(id).done || !!liveByItem[id]?.done;

  useEffect(() => {
    const carregar = () => fetchLiveTasks(template.id, unit.id, today).then(setLiveRaw);
    carregar();
    const unsub = subscribeLiveTasks(template.id, unit.id, today, carregar);
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Observação alheia desce para o campo de quem NÃO está editando aquele item —
  // do colega em tempo real ou da conclusão já registrada. É o que faz o registro
  // final sair com a evidência de todo mundo, e não só a de quem apertou
  // "Concluir".
  useEffect(() => {
    setItemStates(s => {
      let mudou = false;
      const next = { ...s };
      Object.entries(liveByItem).forEach(([id, live]) => {
        if (!next[id] || !live?.note || notasTocadas.current.has(id)) return;
        if (next[id].note === live.note) return;
        next[id] = { ...next[id], note: live.note };
        mudou = true;
      });
      return mudou ? next : s;
    });
  }, [liveByItem]);

  // Duas pessoas ou mais com tarefa concluída nesta rodada = sessão colaborativa.
  useEffect(() => {
    if (collabSessionTracked.current) return;
    const ops = new Set(Object.values(liveByItem).filter(v => v?.done && v.operatorUserId).map(v => v.operatorUserId));
    if (ops.size < 2) return;
    collabSessionTracked.current = true;
    track('collaborative_session', { source: 'checklist', checklistId: template.id, unitId: unit.id, metadata: { operators: ops.size } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveByItem]);

  const doneCount = items.filter(i => effDone(i.id)).length;
  const total = items.length;
  const pendingCritical = items.filter(i => i.critical && !effDone(i.id));
  progressRef.current.done = doneCount; // snapshot p/ o evento de abandono

  const isLocked = idx => {
    for (let j = 0; j < idx; j++) {
      const prev = items[j];
      if (prev.required && !effDone(prev.id)) return true;
    }
    return false;
  };

  const toggle = async (item, idx) => {
    if (isLocked(idx) || emVoo.current.has(item.id)) return;
    const live = liveByItem[item.id];

    // ── Tarefa JÁ REGISTRADA hoje: bloqueada, para qualquer um ──
    // Inclusive para quem a fez. Refazer o que já está gravado é retrabalho, e
    // retrabalho passa pelo "Reabrir" (com motivo), não por um toque distraído.
    if (live?.submitted) {
      const quem = live.operatorUserId === currentUser.id ? 'você' : (live.operatorName || 'um colega');
      const hora = live.completedAt
        ? ` às ${new Date(live.completedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
        : '';
      track('duplicate_execution_blocked', {
        source: 'checklist', checklistId: template.id, taskId: item.id, unitId: unit.id,
        metadata: { by: live.operatorName || null, submitted: true },
      });
      avisar(`"${truncName(item.text, 28)}" já foi feita hoje por ${quem}${hora}. Use "Reabrir" para refazer.`);
      return;
    }

    // Já concluída por um colega na rodada (ainda não submetida) → bloqueia.
    if (live?.done && live.operatorUserId && live.operatorUserId !== currentUser.id) {
      track('duplicate_execution_blocked', { source: 'checklist', checklistId: template.id, taskId: item.id, unitId: unit.id, metadata: { by: live.operatorName || null } });
      avisar(`"${truncName(item.text, 32)}" já foi concluída por ${live.operatorName || 'um colega'}.`);
      return;
    }
    // Já concluída por mim no estado compartilhado → reabrir exige motivo (auditoria).
    if (live?.done) {
      setReopenTarget(item);
      return;
    }
    const state = estadoDe(item.id);

    // ── Desmarcar (só local: a rodada não tem esta tarefa como concluída) ──
    if (state.done) {
      setItemStates(s => ({ ...s, [item.id]: { ...s[item.id], done: false } }));
      releaseLiveTask({ templateId: template.id, unitId: unit.id, date: today, itemId: item.id, userId: currentUser.id });
      return;
    }

    // ── Marcar ──
    // A foto pode vir de mim OU já estar na rodada (o colega anexou).
    if (item.photoRequired && !state.photo && !live?.photoPath) return;

    // Otimista: o check aparece na hora. Se a reivindicação for perdida para um
    // colega, volta atrás — é preferível ao checkbox travado esperando a rede.
    emVoo.current.add(item.id);
    setItemStates(s => ({ ...s, [item.id]: { ...s[item.id], done: true } }));
    setLiveRaw(m => ({ ...m, [item.id]: {
      ...(m[item.id] || {}), done: true,
      operatorUserId: currentUser.id, operatorName: currentUser.name,
      completedAt: new Date().toISOString(),
    } }));

    const r = await claimLiveTask({
      templateId: template.id, unitId: unit.id, date: today, itemId: item.id,
      userId: currentUser.id, userName: currentUser.name,
      note: (state.note || '').trim() || null,
    });
    emVoo.current.delete(item.id);

    // Perdeu a corrida: o banco já tinha dono. Desfaz o otimismo e avisa — sem
    // creditar a tarefa, que é o ponto do bloqueio de duplicidade.
    const dono = r.task?.operatorUserId;
    if (r.ok && !r.claimed && dono && dono !== currentUser.id) {
      setItemStates(s => ({ ...s, [item.id]: { ...s[item.id], done: false } }));
      setLiveRaw(m => ({ ...m, [item.id]: r.task }));
      track('duplicate_execution_blocked', { source: 'checklist', checklistId: template.id, taskId: item.id, unitId: unit.id, metadata: { by: r.task.operatorName || null, race: true } });
      avisar(`"${truncName(item.text, 32)}" acabou de ser concluída por ${r.task.operatorName || 'um colega'}.`);
      return;
    }
    if (r.task) setLiveRaw(m => ({ ...m, [item.id]: r.task }));
    track('task_checked', {
      source: 'checklist', checklistId: template.id, taskId: item.id, unitId: unit.id,
      metadata: { critical: !!item.critical, position: idx + 1, of: items.length, offline: !!r.offline },
    });
  };

  const confirmReopen = async () => {
    const item = reopenTarget;
    if (!item) return;
    const motivo = reopenReason.trim() || null;
    setReopenTarget(null); setReopenReason('');
    setItemStates(s => ({ ...s, [item.id]: { ...s[item.id], done: false } }));
    // O contador adiantado é o que destrava a tarefa na hora: o merge trata
    // `reopenedCount > 0` como reabertura deliberada e para de aplicar a
    // conclusão já registrada. Sem ele, reabrir não teria efeito visível — a
    // tarefa seguiria barrada pelo próprio registro que se quer refazer.
    setLiveRaw(m => ({ ...m, [item.id]: {
      ...m[item.id], done: false,
      reopenedCount: (m[item.id]?.reopenedCount || 0) + 1,
    } }));
    // O contador de reabertura é incrementado no banco (era ler-somar-gravar no
    // cliente, e duas reaberturas quase simultâneas contavam uma).
    await reopenLiveTask({
      templateId: template.id, unitId: unit.id, date: today, itemId: item.id,
      userId: currentUser.id, userName: currentUser.name, reason: motivo,
    });
    track('task_reopened', { source: 'checklist', checklistId: template.id, taskId: item.id, unitId: unit.id, metadata: { reason: motivo } });
  };

  // A observação entra na rodada com atraso: compartilhar é o objetivo, mas uma
  // escrita por tecla digitada seria uma escrita por tecla digitada.
  const setNote = (id, note) => {
    notasTocadas.current.add(id);
    setItemStates(s => ({ ...s, [id]: { ...s[id], note } }));
    clearTimeout(notaTimers.current[id]);
    notaTimers.current[id] = setTimeout(() => {
      setLiveEvidence({ templateId: template.id, unitId: unit.id, date: today, itemId: id, note });
      setLiveRaw(m => ({ ...m, [id]: { ...(m[id] || {}), note } }));
    }, 900);
  };

  const setPhoto = async (id, file) => {
    try {
      const dataUrl = await compressImage(file);
      setItemStates(s => ({ ...s, [id]: { ...s[id], photo: dataUrl, photoDataUrl: dataUrl } }));
      // A foto sobe para a RODADA na hora em que é anexada. Antes ela só existia
      // no aparelho de quem fotografou e subia no submit — se quem submetesse
      // fosse o colega, a evidência não chegava a lugar nenhum.
      const path = await uploadRoundPhoto({ templateId: template.id, unitId: unit.id, date: today, itemId: id, dataUrl });
      if (!path) return;
      await setLiveEvidence({ templateId: template.id, unitId: unit.id, date: today, itemId: id, photoPath: path });
      setLiveRaw(m => ({ ...m, [id]: { ...(m[id] || {}), photoPath: path } }));
    } catch (e) { console.error(e); }
  };

  const submit = async () => {
    submittedRef.current = true; // desmontagem após concluir não é abandono
    const recordId = uid();
    const record = {
      id: recordId,
      templateId: template.id,
      templateName: template.name,
      unitId: unit.id,
      sector: template.sector,
      shift: shiftLabel(template),
      date: today,
      completedAt: new Date().toISOString(),
      operatorName: currentUser.name,
      operatorUserId: currentUser.id,
      items: items.map(i => {
        const live = liveByItem[i.id];
        const done = estadoDe(i.id).done || !!live?.done;
        // Evidência da RODADA, não só a minha: a observação e a foto que o
        // colega anexou entram no registro de quem submete. Sem isto, executar
        // a quatro mãos produzia um registro com metade da prova.
        const note = (estadoDe(i.id).note || '').trim() || live?.note || '';
        return {
          id: i.id, text: i.text, critical: i.critical, required: !!i.required,
          done, note,
          hasPhoto: !!estadoDe(i.id).photo || !!live?.photoPath,
          // Atribuição individual (execução colaborativa): quem de fato concluiu
          // cada tarefa e quando — base da contagem por tarefa e da produtividade.
          doneBy: done ? (live?.operatorUserId || currentUser.id) : null,
          doneByName: done ? (live?.operatorName || currentUser.name) : null,
          doneAt: done ? (live?.completedAt || new Date().toISOString()) : null,
          // De que dia esta tarefa veio, quando não é do dia. A quitação NÃO
          // depende disto (ela é derivada de `done` por dia, em
          // `pendenciasArrastadas`) — o carimbo existe para o registro contar a
          // história: quem lê a conclusão depois vê que a tarefa estava
          // atrasada, e quanto. `null` no caso normal para não inchar o JSONB.
          carriedFrom: i.carriedFrom || null,
        };
      }),
    };

    // A comemoração aparece já: nada abaixo depende de interação, e esperar o
    // upload de três fotos de olho numa tela parada é o que fazia a pessoa
    // fechar o app no meio.
    setCompletionRecord(record);

    // A CONCLUSÃO PRIMEIRO, as fotos depois. Esta ordem estava invertida: o
    // metadado das fotos era gravado aqui com `recordId`, e a conclusão só ia
    // para o banco quando a pessoa apertava "Concluir" na tela de comemoração.
    // Toda linha de `photos` referenciava uma conclusão que ainda não existia e
    // era recusada — o arquivo subia e a evidência sumia do relatório.
    await onComplete(record);

    // Upload photos to Supabase Storage (falls back to local cache if offline)
    for (const i of items) {
      const photo = estadoDe(i.id).photo;
      if (photo) {
        try {
          await uploadPhoto(recordId, i.id, photo);
          track('photo_uploaded', {
            source: 'checklist', checklistId: template.id, taskId: i.id, unitId: unit.id,
            metadata: { required: !!i.photoRequired },
          });
        } catch (e) { console.error(e); }
      } else if (liveByItem[i.id]?.photoPath) {
        // Foto que o colega anexou nesta rodada: aponta o metadado para o
        // arquivo que já está no storage. Sem copiar bytes — a tela de detalhe
        // resolve por `photos.storage_path` como em qualquer outra foto.
        await linkRoundPhoto(recordId, i.id, liveByItem[i.id].photoPath);
      }
    }
  };

  // Âncora da tela de conclusão.
  //
  // Ela nascia na posição de rolagem em que a pessoa estava no checklist — que,
  // ao apertar "Concluir", é o fim da lista. Resultado: a tela abria cortada, com
  // o ícone e o título já fora do viewport. Aqui subimos a página E todo
  // container rolável acima da âncora (no desktop quem rola é um painel interno,
  // não a janela), para ela começar logo abaixo do cabeçalho de lojas.
  const celebRef = useRef(null);
  useEffect(() => {
    if (!completionRecord) return;
    try { window.scrollTo({ top: 0, behavior: 'auto' }); } catch (_) {}
    let p = celebRef.current?.parentElement;
    while (p) {
      if (p.scrollHeight > p.clientHeight + 1) p.scrollTop = 0;
      p = p.parentElement;
    }
  }, [completionRecord]);

  const finish = () => {
    // A foto exigida pode estar em três lugares, e qualquer um serve: comigo, na
    // rodada (colega anexou) ou implícita no item que o colega já concluiu.
    // Olhar só a minha travava quem NÃO tirou a foto — a pessoa via o item
    // concluído na tela e não conseguia fechar o checklist de jeito nenhum.
    const missingPhoto = items.find(i =>
      i.photoRequired && !estadoDe(i.id).photo && !liveByItem[i.id]?.photoPath && !liveByItem[i.id]?.done);
    if (missingPhoto) { setError(`Anexe a foto exigida em "${missingPhoto.text}".`); return; }
    setError('');
    if (pendingCritical.length > 0) { setShowConfirm(true); return; }
    submit();
  };

  // Celebration screen after completion
  if (completionRecord) {
    const done = completionRecord.items.filter(i => i.done).length;
    const total = completionRecord.items.length;
    const rate = Math.round((done / total) * 100);
    const criticalMissed = completionRecord.items.filter(i => i.critical && !i.done).length;
    const levels = [
      { min: 100, Icon: Trophy,        title: 'Perfeito!', msg: 'Todos os itens concluídos. Excelente trabalho!', color: C.success },
      { min: 90,  Icon: CheckCircle2,  title: 'Excelente!', msg: 'Quase tudo concluído. Continue assim!', color: C.success },
      { min: 75,  Icon: ThumbsUp,      title: 'Bom trabalho!', msg: 'A maioria dos itens foi concluída.', color: unit.color },
      { min: 50,  Icon: TrendingUp,    title: 'Checklist registrado', msg: 'Você pode melhorar! Tente concluir mais itens amanhã.', color: C.warning },
      { min: 0,   Icon: AlertTriangle, title: 'Registrado com pendências', msg: 'Muitos itens ficaram pendentes. Priorize-os no próximo turno.', color: C.critical },
    ];
    const level = levels.find(l => rate >= l.min);
    const LevelIcon = level.Icon;
    return (
      // `minHeight: 100vh` era o outro motivo do corte: somado ao cabeçalho de
      // lojas, o bloco sempre ficava mais alto que a tela, então SEMPRE havia
      // rolagem e o conteúdo centrado nunca caberia inteiro. Agora ele tem a
      // altura do próprio conteúdo e começa no topo — junto com a âncora, aparece
      // completo abaixo do cabeçalho. O padding inferior livra a barra de navegação.
      <div ref={celebRef} style={{ background: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', padding: '12px 24px', paddingBottom: 'calc(var(--zc-nav-h) + 32px + env(safe-area-inset-bottom, 0px))' }}>
        <LevelIcon size={56} color={level.color} strokeWidth={1.5} aria-hidden style={{ marginBottom: 14 }} />
        <p className="font-display" style={{ fontSize: 'calc(26px * var(--zc-t-scale))', fontWeight: W.bold, color: level.color, textAlign: 'center', marginBottom: 8 }}>{level.title}</p>
        <p style={{ fontSize: 14, color: C.muted, textAlign: 'center', maxWidth: 280, lineHeight: 1.6, marginBottom: 20 }}>{level.msg}</p>
        <div style={{ background: 'white', borderRadius: 14, padding: '16px 24px', border: `2px solid ${level.color}30`, textAlign: 'center', marginBottom: 20, minWidth: 200 }}>
          <p style={{ fontSize: 48, fontWeight: W.bold, color: level.color, lineHeight: 1 }}>{rate}%</p>
          <p style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>{done} de {total} itens</p>
          {criticalMissed > 0 && (
            <p style={{ fontSize: 12, color: C.critical, fontWeight: W.semibold, marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <AlertTriangle size={12} aria-hidden /> {criticalMissed} crítico{criticalMissed > 1 ? 's' : ''} pendente{criticalMissed > 1 ? 's' : ''}
            </p>
          )}
          <div style={{ width: '100%', height: 6, background: C.border, borderRadius: 999, overflow: 'hidden', marginTop: 10 }}>
            <div style={{ height: '100%', width: `${rate}%`, background: level.color, borderRadius: 999 }} />
          </div>
        </div>
        <p style={{ fontSize: 12, color: C.muted, textAlign: 'center', marginBottom: 24 }}>
          {template.name} · {template.sector} · {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </p>
        {/* Só fecha. A gravação já aconteceu no `submit` — deixá-la aqui era o
            que punha as fotos na frente da conclusão que elas referenciam. */}
        <button onClick={() => onDone()}
          style={{ padding: '14px 40px', borderRadius: 12, background: unit.color, color: 'white', border: 'none', fontWeight: W.semibold, fontSize: 15, cursor: 'pointer' }}>
          Concluir →
        </button>
      </div>
    );
  }

  return (
    <div className="zc-view" style={{ paddingBottom: "calc(160px + env(safe-area-inset-bottom, 0px))" }}>
      <BackBar onBack={onCancel} label={template.sector} accent={unit.color}
        motiv={(() => {
          const n = (template.name || '').toLowerCase();
          const isArray = Array.isArray(template.shift);
          if (n.includes('abertura') || (!isArray && template.shift === 'Manhã')) return 'Faça um excelente dia!';
          if (n.includes('fechamento') || (!isArray && template.shift === 'Tarde')) return 'Bom descanso!';
          return null;
        })()}
      />
      <div className="mb-3">
        <h2 className="font-display" style={{ fontSize: 'calc(18px * var(--zc-t-scale))', fontWeight: W.semibold, color: C.ink }}>{template.name}</h2>
        {template.deadline && <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Prazo até {template.deadline}</p>}
      </div>

      <div className="mb-3">
        <Ticket accent={unit.color}>
          <div className="flex items-center gap-2">
            <div style={{ width: 28, height: 28, borderRadius: 999, background: `${ROLE_COLORS[currentUser.role]}1A`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <User size={14} color={ROLE_COLORS[currentUser.role]} />
            </div>
            <div>
              <Eyebrow>Responsável</Eyebrow>
              <p style={{ fontSize: 14, fontWeight: W.semibold, color: C.ink, marginTop: 1 }}>{currentUser.name}</p>
            </div>
          </div>
        </Ticket>
      </div>

      <div className="space-y-2">
        {items.map((item, idx) => (
          <ItemRow
            key={item.id} item={item} state={estadoDe(item.id)} accent={unit.color}
            locked={isLocked(idx)}
            liveInfo={liveByItem[item.id]} currentUserId={currentUser.id}
            onReopen={liveByItem[item.id]?.done ? () => setReopenTarget(item) : undefined}
            onToggle={() => toggle(item, idx)} onNote={v => setNote(item.id, v)}
            onPhoto={file => setPhoto(item.id, file)}
          />
        ))}
      </div>

      {error && <p style={{ fontSize: 12, fontWeight: W.semibold, color: C.critical, marginTop: 8 }}>{error}</p>}

      <div className="zc-actionbar fixed left-0 right-0 p-3" style={{ bottom: "calc(var(--zc-nav-h) + env(safe-area-inset-bottom, 0px))", background: 'rgba(250,246,239,0.96)', borderTop: `1px solid ${C.border}`, zIndex: 90 }}>
        <div className="flex items-center justify-between mb-2">
          <span style={{ fontSize: 12, fontWeight: W.semibold, color: C.muted }}>{doneCount} de {total} concluídos</span>
          <div style={{ width: 120, height: 6, background: C.border, borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(doneCount / total) * 100}%`, background: unit.color }} />
          </div>
        </div>
        <button
          onClick={finish}
          className="font-display w-full py-3"
          style={{ borderRadius: 6, border: 'none', fontWeight: W.semibold, color: C.bg, background: unit.color }}
        >
          Concluir checklist
        </button>
      </div>

      {showConfirm && (
        <ConfirmModal
          items={pendingCritical.map(i => i.text)}
          onCancel={() => setShowConfirm(false)}
          onConfirm={() => { setShowConfirm(false); submit(); }}
        />
      )}

      {/* Aviso de execução colaborativa bloqueada (H6) */}
      {collabNotice && (
        <div className="zc-overlay" style={{ position: 'fixed', bottom: 'calc(120px + env(safe-area-inset-bottom,0px))', left: 16, right: 16, zIndex: 300, background: C.ink, color: 'white', borderRadius: 12, padding: '12px 16px', textAlign: 'center', fontSize: 13, fontWeight: W.semibold, boxShadow: '0 4px 20px rgba(0,0,0,0.25)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Lock size={14} aria-hidden style={{ flexShrink: 0 }} /> {collabNotice}
          </span>
        </div>
      )}

      {/* Reabrir tarefa — exige motivo (auditoria, H6) */}
      {reopenTarget && (
        <div className="zc-sheet" style={{ position: 'fixed', inset: 0, zIndex: 310, background: 'rgba(6,60,92,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div className="zc-sheet-panel" style={{ width: '100%', maxWidth: 480, background: C.bg, borderRadius: '20px 20px 0 0', padding: 18, paddingBottom: 'calc(18px + env(safe-area-inset-bottom,0px))' }}>
            <p className="font-display" style={{ fontSize: 'calc(17px * var(--zc-t-scale))', fontWeight: W.semibold, color: C.ink, marginBottom: 6 }}>Reabrir tarefa</p>
            <p style={{ fontSize: 13, color: C.muted, marginBottom: 12, lineHeight: 1.4 }}>
              "{truncName(reopenTarget.text, 44)}" será marcada como pendente. Registre o motivo para a auditoria.
            </p>
            <textarea value={reopenReason} onChange={e => setReopenReason(e.target.value)} rows={3}
              placeholder="Motivo da reabertura (ex.: precisa refazer, ficou incompleto)"
              style={{ width: '100%', padding: 12, borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 14, resize: 'none', marginBottom: 14, background: 'white', color: C.ink }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setReopenTarget(null); setReopenReason(''); }}
                style={{ flex: 1, padding: '13px 0', borderRadius: 12, background: 'white', color: C.muted, border: `1px solid ${C.border}`, fontWeight: W.semibold, fontSize: 14, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={confirmReopen}
                style={{ flex: 1, padding: '13px 0', borderRadius: 12, background: C.critical, color: 'white', border: 'none', fontWeight: W.semibold, fontSize: 14, cursor: 'pointer' }}>
                Reabrir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ executar view ------------------------------ */


export function ExecutarView({ unit, templates, completions, closures, currentUser, onSaveCompletion, activeTypes = CHECKLIST_TYPE_ORDER }) {
  const [checklistType, setChecklistType] = useState(null);
  const [activeTemplate, setActiveTemplate] = useState(null);
  const today = todayStr(tzOf(unit));
  const sectorRows = useSectors();
  const sectors = visibleSectors(unit, currentUser?.sectorId, sectorRows);

  /**
   * O que há para fazer hoje em cada checklist — previstas + arrastadas.
   *
   * Calculado UMA vez por render, não por chamada: a varredura de carryover
   * olha até 7 dias para trás por tarefa arrastável, e a lista de nível 1
   * consulta todos os checklists uma vez por TIPO. Sem o mapa, um bar com 20
   * checklists refazia a varredura 60 vezes a cada render.
   *
   * É o que decide se o checklist EXISTE hoje: um de seg/qua/sex com dívida da
   * segunda precisa aparecer na terça, mesmo sem nada previsto para terça —
   * era exatamente o buraco por onde a tarefa sumia.
   */
  const itensPorTemplate = useMemo(() => {
    const m = new Map();
    (templates || []).forEach(t => {
      if (t.unitId === unit.id) m.set(t.id, itensDoDia(t, completions, closures, today));
    });
    return m;
  }, [templates, completions, closures, unit.id, today]);
  const itensDe = t => itensPorTemplate.get(t.id) || [];

  if (activeTemplate) {
    return (
      <ExecutionScreen
        template={activeTemplate} unit={unit} currentUser={currentUser}
        completions={completions} closures={closures}
        onCancel={() => setActiveTemplate(null)}
        onComplete={record => onSaveCompletion(record)}
        onDone={() => setActiveTemplate(null)}
      />
    );
  }

  if (isUnitClosed(closures, unit.id, today)) {
    return (
      <div className="p-4 flex flex-col items-center justify-center" style={{ minHeight: 300 }}>
        <Calendar size={40} color={C.mutedLight} />
        <p className="font-display" style={{ fontWeight: W.semibold, fontSize: 'calc(18px * var(--zc-t-scale))', color: C.ink, textAlign: 'center', marginTop: 16 }}>
          {unit.name} está fechada hoje
        </p>
        <p style={{ fontSize: 13, color: C.muted, marginTop: 8, textAlign: 'center' }}>
          Este dia foi marcado como folga. Nenhum checklist é necessário.
        </p>
      </div>
    );
  }

  // Level 2: praças for the selected checklist type
  // Se o tipo sumiu de activeTypes (ex.: tipos dinâmicos chegaram do banco
  // depois da seleção), cai para o nível 1 em vez de quebrar.
  // Abrir um checklist já concluído hoje é LIVRE — e precisa ser: "concluído"
  // aqui significa "submetido", não "tudo feito". Quem fechou com 5 de 8 itens
  // deixou 3 pendentes, e alguém tem que poder entrar e fazer os 3.
  //
  // O que não pode é refazer TAREFA já executada. Esse bloqueio mora dentro da
  // execução, item por item (ver `submittedByItem` em ExecutionScreen): barrar o
  // checklist inteiro trancava junto o trabalho que ainda faltava.
  const abrirTemplate = (t) => {
    const jaFeito = completions.some(c => c.templateId === t.id && c.date === today);
    if (jaFeito) {
      track('checklist_reexecucao', {
        source: 'checklist', checklistId: t.id, unitId: unit.id,
        metadata: { template_name: t.name },
      });
    }
    setActiveTemplate(t);
  };

  const typeConfig = checklistType ? activeTypes.find(c => c.key === checklistType) : null;
  if (typeConfig) {
    // Get all templates for this type in visible sectors
    const typeTemplates = templates.filter(t =>
      templateAtiva(t) &&
      t.unitId === unit.id &&
      sectors.includes(t.sector) &&
      typeConfig.match(t) &&
      itensDe(t).length > 0
    ).sort((a, b) => a.name.localeCompare(b.name));

    // Group by sector for IBR1 (has praças), flat for IBR2/3
    const isIbr1 = unit.id === 'ibr1';
    const grouped = isIbr1
      ? ['Salão', 'Cozinha'].map(s => ({
          sector: s,
          templates: typeTemplates.filter(t => t.sector === s),
        })).filter(g => g.templates.length > 0)
      : [{ sector: null, templates: typeTemplates }];

    return (
      <div className="zc-view space-y-3">
        <BackBar onBack={() => setChecklistType(null)} label={typeConfig.label} accent={unit.color} />
        {grouped.map(({ sector, templates: ts }) => (
          <div key={sector || 'all'}>
            {sector && <Eyebrow>{sector}</Eyebrow>}
            <div className="space-y-2">
              {ts.map(t => {
                const status = templateStatus(t, completions, today, tzOf(unit));
                const prog = templateProgress(t, completions, today);
                const doDia = itensDe(t);
                const count = doDia.length;
                // As arrastadas contam como trabalho a fazer (é o que a pessoa
                // encontra ao abrir), mas NÃO entram em `prog`, que é a régua
                // da aderência do dia. Por isso elas aparecem como parcela
                // própria em vez de somadas no "X de Y": o cartão e a métrica
                // discordarem em silêncio seria pior que os dois errados.
                const atrasadas = doDia.filter(i => i.carriedFrom).length;
                const selo = atrasadas ? ` · ${atrasadas} atrasada${atrasadas > 1 ? 's' : ''}` : '';
                // Extract praça name — format is "Praça — Tipo (detalhes)"
                const displayName = t.name.includes(' — ') ? t.name.split(' — ')[0] : t.sector;
                return (
                  <button key={t.id} onClick={() => abrirTemplate(t)} className="w-full text-left" style={{ background: 'none', border: 'none', padding: 0 }}>
                    <Ticket accent={STATUS_CFG[status].color}>
                      <div className="flex items-center justify-between gap-2">
                        <div style={{ minWidth: 0 }}>
                          <p className="font-display" style={{ fontWeight: W.semibold, color: C.ink }}>{displayName}</p>
                          <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                            {/* No parcial, o que importa é o TAMANHO do que falta —
                                "Parcial" sozinho não diz se falta 1 ou 7. */}
                            {status === 'partial'
                              ? `${prog.done} de ${prog.total} feitos${selo}${t.deadline ? ` · até ${t.deadline}` : ''}`
                              : `${count} item${count > 1 ? 's' : ''} hoje${selo}${t.deadline ? ` · até ${t.deadline}` : ''}`}
                          </p>
                        </div>
                        <StatusBadge status={status} />
                      </div>
                    </Ticket>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Level 1: checklist types
  return (
    <div className="zc-view space-y-3">
      <Eyebrow>{unit.name}</Eyebrow>
      <div className="space-y-2">
        {activeTypes.map(({ key, label, match }) => {
          const list = templates.filter(t =>
            templateAtiva(t) &&
            t.unitId === unit.id && match(t) && itensDe(t).length > 0 &&
            sectors.includes(t.sector)
          );
          // Um status por checklist, calculado UMA vez: `templateStatus` agora
          // varre as conclusões do dia, e chamá-lo três vezes por checklist (como
          // antes) triplicaria esse trabalho a cada render.
          const statuses = list.map(t => templateStatus(t, completions, today, tzOf(unit)));
          const done = statuses.filter(s => s === 'done').length;
          const partial = statuses.filter(s => s === 'partial').length;
          const total = list.length;
          const overdue = statuses.filter(s => s === 'overdue').length;
          if (total === 0) return null;
          const isPraca = unit.id === 'ibr1'; // praça (fem.) · setor (masc.)
          const unitLabel = isPraca ? (total > 1 ? 'praças' : 'praça') : (total > 1 ? 'setores' : 'setor');
          return (
            <button key={key} onClick={() => setChecklistType(key)} className="w-full text-left" style={{ background: 'none', border: 'none', padding: 0 }}>
              <Ticket accent={unit.color}>
                <div className="flex items-center justify-between gap-2">
                  <div style={{ minWidth: 0 }}>
                    <p className="font-display" style={{ fontWeight: W.semibold, color: C.ink }}>{label}</p>
                    <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                      {done}/{total} {unitLabel} concluíd{isPraca ? 'a' : 'o'}{total > 1 ? 's' : ''}
                      {/* O parcial sai do "concluídos" e ganha linha própria: ele
                          era contado como concluído e escondia trabalho pendente. */}
                      {partial > 0 && <span style={{ color: C.warning, fontWeight: W.semibold }}> · {partial} parcial{partial > 1 ? 'is' : ''}</span>}
                      {overdue > 0 && <span style={{ color: C.critical, fontWeight: W.semibold }}> · {overdue} atrasad{isPraca ? 'a' : 'o'}{overdue > 1 ? 's' : ''}</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {done === total
                      ? <CheckCircle2 size={20} color={C.success} />
                      : <ChevronRight size={16} color={C.muted} />}
                  </div>
                </div>
              </Ticket>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ----------------------------- template editor ------------------------------- */

// Editor de orientação de um item (texto, fotos, documentos POP, vídeo, link).
// Compartilhado entre o TemplateEditor (edição) e o formulário "+ Novo".
// `apply(fn)` recebe uma função (itemAtual → patch) — os uploads são assíncronos
// e o item pode ter mudado até a resposta chegar.
function ItemGuidanceEditor({ item, accent, apply }) {
  const [docUploading, setDocUploading] = useState(false);
  const [docError, setDocError] = useState(null);

  const compressRefPhoto = file => new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const maxW = 400; // base64 pequeno (~30KB) — vive no JSON do template
      const scale = Math.min(1, maxW / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.src = url;
  });

  return (
    <div className="mt-2" style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
      <p style={{ fontSize: 10, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted, marginBottom: 8 }}>
        Orientação — aparece no botão "Ver mais"
      </p>

      {/* Texto */}
      <textarea
        value={item.description || ''}
        onChange={e => { const v = e.target.value; apply(() => ({ description: v })); }}
        placeholder="Instruções detalhadas para orientar o colaborador..."
        rows={2}
        style={{ width: '100%', fontSize: 13, color: C.ink, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 10px', outline: 'none', resize: 'vertical', lineHeight: 1.5, fontFamily: 'inherit', marginBottom: 8 }}
      />

      {/* Fotos de referência */}
      <p style={{ fontSize: 10, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted, marginBottom: 6 }}>Fotos de referência</p>
      <div className="flex flex-wrap gap-2" style={{ marginBottom: 8 }}>
        {(item.refPhotos || []).map((photo, pi) => (
          <div key={pi} style={{ position: 'relative' }}>
            <img src={photo} alt={`ref ${pi+1}`} style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 6, border: `1px solid ${C.border}` }} />
            <button
              onClick={() => apply(i => ({ refPhotos: (i.refPhotos || []).filter((_, x) => x !== pi) }))}
              style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: C.critical, border: 'none', color: 'white', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: W.semibold, lineHeight: 1 }}
            >×</button>
          </div>
        ))}
        {(item.refPhotos || []).length < 5 && (
          <label style={{ width: 72, height: 72, borderRadius: 6, border: `2px dashed ${C.border}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', gap: 4 }}>
            <Camera size={18} color={C.muted} />
            <span style={{ fontSize: 10, color: C.muted, fontWeight: W.semibold }}>Adicionar</span>
            <input type="file" accept="image/*" style={{ display: 'none' }}
              onChange={async e => {
                const file = e.target.files?.[0];
                if (!file) return;
                e.target.value = '';
                const compressed = await compressRefPhoto(file);
                apply(i => ({ refPhotos: [...(i.refPhotos || []), compressed] }));
              }}
            />
          </label>
        )}
      </div>

      {/* Documentos de referência (POP) */}
      <p style={{ fontSize: 10, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted, marginBottom: 6 }}>Documentos (POP, manual — PDF, Word etc.)</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
        {(item.refDocs || []).map((doc, di) => (
          <div key={di} className="flex items-center gap-2" style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px' }}>
            <FileText size={14} color={C.muted} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 12.5, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</span>
            <button
              onClick={() => apply(i => ({ refDocs: (i.refDocs || []).filter((_, x) => x !== di) }))}
              style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', flexShrink: 0 }}
            ><X size={14} color={C.muted} /></button>
          </div>
        ))}
        {(item.refDocs || []).length < 3 && (
          <label className="flex items-center gap-2" style={{ width: 'fit-content', fontSize: 11, fontWeight: W.semibold, color: docUploading ? C.muted : accent, border: `1.5px dashed ${docUploading ? C.border : accent}`, borderRadius: 6, padding: '7px 12px', cursor: docUploading ? 'default' : 'pointer' }}>
            <Plus size={13} />
            {docUploading ? 'Enviando…' : 'Anexar documento'}
            <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt" style={{ display: 'none' }}
              disabled={docUploading}
              onChange={async e => {
                const file = e.target.files?.[0];
                if (!file) return;
                e.target.value = '';
                if (file.size > 10 * 1024 * 1024) {
                  setDocError('Arquivo acima de 10 MB — reduza e tente de novo.');
                  return;
                }
                setDocError(null);
                setDocUploading(true);
                try {
                  const doc = await uploadRefDoc(file);
                  apply(i => ({ refDocs: [...(i.refDocs || []), doc] }));
                } catch (err) {
                  console.warn('uploadRefDoc failed', err);
                  setDocError('Falha no envio — verifique a conexão e tente de novo.');
                }
                setDocUploading(false);
              }}
            />
          </label>
        )}
        {docError && <p style={{ fontSize: 11, fontWeight: W.semibold, color: C.critical }}>{docError}</p>}
      </div>

      {/* Vídeo externo (YouTube etc.) */}
      <p style={{ fontSize: 10, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted, marginBottom: 6 }}>Vídeo externo (YouTube — passo a passo da tarefa)</p>
      <input
        value={item.refVideo || ''}
        onChange={e => { const v = e.target.value; apply(() => ({ refVideo: v })); }}
        placeholder="https://youtube.com/watch?v=..."
        style={{ width: '100%', fontSize: 13, color: C.ink, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 10px', outline: 'none', fontFamily: 'inherit', marginBottom: 8 }}
      />

      {/* Link externo */}
      <p style={{ fontSize: 10, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted, marginBottom: 6 }}>Link externo (documento online, Drive etc.)</p>
      <input
        value={item.refLink || ''}
        onChange={e => { const v = e.target.value; apply(() => ({ refLink: v })); }}
        placeholder="https://... link de material de apoio"
        style={{ width: '100%', fontSize: 13, color: C.ink, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 10px', outline: 'none', fontFamily: 'inherit' }}
      />
    </div>
  );
}

// Exportado para o teste de renderização (tests/carryover-render.spec.mjs)
// alcançar o editor de tarefa sem sessão logada. Nada mais o importa.
export function TemplateEditor({ unit, sector, template, onSave, onCancel, checklistType, allTemplates }) {
  const [name, setName] = useState(template?.name || '');
  const [deadline, setDeadline] = useState(template?.deadline || '');
  const [items, setItems] = useState(template?.items || [{ id: uid(), text: '', critical: false, required: false, photoRequired: false }]);
  const [itemCopyTargets, setItemCopyTargets] = useState({});  // kept for future use
  const [dragState, setDragState] = useState(null); // { id, startIndex, overIndex, type }
  const dragRef = useRef(null);

  const handleDragStart = (e, id, index, type) => {
    e.preventDefault();
    const getY = ev => type === 'touch' ? ev.touches[0].clientY : ev.clientY;
    const startY = getY(e);

    // Nada de altura fixa: o alvo sai da posição REAL dos cards. A conta antiga
    // fotografava a altura do primeiro card e dividia o deslocamento por ela —
    // com o card de item medindo ~563px (ele carrega o editor de orientação),
    // era preciso arrastar mais de meia tela para andar UMA posição, e o gesto
    // normal devolvia shift 0: o item voltava para o lugar e o arraste parecia
    // não funcionar.

    dragRef.current = { id, startIndex: index, overIndex: index };
    setDragState({ id, startIndex: index, overIndex: index });

    const onMove = ev => {
      if (type === 'touch') ev.preventDefault();
      const y = getY(ev);
      const kids = [...(document.getElementById('item-list-container')?.children || [])];
      let newOver = dragRef.current?.overIndex ?? index;
      for (let i = 0; i < kids.length; i++) {
        const r = kids[i].getBoundingClientRect();
        if (y >= r.top && y <= r.bottom) { newOver = i; break; }
      }
      const primeiro = kids[0]?.getBoundingClientRect();
      const ultimo = kids[kids.length - 1]?.getBoundingClientRect();
      if (primeiro && y < primeiro.top) newOver = 0;
      if (ultimo && y > ultimo.bottom) newOver = kids.length - 1;
      newOver = Math.max(0, Math.min(items.length - 1, newOver));
      if (newOver !== dragRef.current.overIndex) {
        dragRef.current.overIndex = newOver;
        setDragState(prev => prev ? { ...prev, overIndex: newOver } : null);
      }
    };

    const onEnd = () => {
      if (dragRef.current) {
        const { startIndex, overIndex } = dragRef.current;
        if (startIndex !== overIndex) {
          setItems(prev => {
            const next = [...prev];
            const [moved] = next.splice(startIndex, 1);
            next.splice(overIndex, 0, moved);
            return next;
          });
        }
      }
      dragRef.current = null;
      setDragState(null);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };

    if (type === 'touch') {
      window.addEventListener('touchmove', onMove, { passive: false });
      window.addEventListener('touchend', onEnd);
    } else {
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onEnd);
    }
  };

  // Sibling templates (same praça, different type) for "copy to" feature
  const siblingTemplates = (allTemplates || []).filter(t =>
    t.unitId === unit.id &&
    t.sector === (template?.sector || sector) &&
    t.id !== template?.id &&
    t.name.split(' — ')[0] === (template?.name || '').split(' — ')[0]
  );

  // Shift: derive default from checklistType if new template
  const defaultShift = template?.shift || (
    checklistType === 'abertura' ? 'Manhã' :
    checklistType === 'fechamento' ? 'Tarde' :
    checklistType === 'intermediario' ? ['Manhã', 'Tarde'] : 'Manhã'
  );
  const [shift, setShift] = useState(defaultShift);

  const updateItem = (id, patch) => setItems(items.map(i => i.id === id ? { ...i, ...patch } : i));
  const addItem = () => setItems([...items, { id: uid(), text: '', critical: false, required: false, photoRequired: false }]);
  // Botão gêmeo no topo: com card de item alto, chegar ao botão do fim exige
  // rolar o checklist inteiro. Insere na posição 1 — é onde o campo aparece.
  const addItemTop = () => setItems([{ id: uid(), text: '', critical: false, required: false, photoRequired: false }, ...items]);
  const removeItem = id => setItems(items.filter(i => i.id !== id));
  const moveItem = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
  };

  const save = () => {
    const cleanItems = items.filter(i => i.text.trim());
    const vazios = items.length - cleanItems.length;
    // As duas saídas silenciosas daqui explicavam "adicionei um item e não
    // salvou": item sem texto era descartado sem avisar, e com o nome vazio (ou
    // nenhum item preenchido) o botão simplesmente não reagia.
    if (!name.trim()) { showToast('Dê um nome ao checklist antes de salvar.'); return; }
    if (cleanItems.length === 0) {
      showToast(vazios > 0
        ? 'Escreva o texto das tarefas — nenhuma tem descrição ainda.'
        : 'Adicione pelo menos uma tarefa.');
      return;
    }
    if (vazios > 0) {
      showToast(`${vazios} tarefa${vazios > 1 ? 's' : ''} sem texto não ${vazios > 1 ? 'foram salvas' : 'foi salva'}.`);
    }
    onSave({
      id: template?.id, name: name.trim(), deadline: deadline || null,
      shift,
      items: cleanItems.map(i => ({ ...i, text: i.text.trim() })),
    });
  };

  return (
    <div className="zc-view" style={{ paddingBottom: "calc(160px + env(safe-area-inset-bottom, 0px))" }}>
      <BackBar onBack={onCancel} label={template?.name?.includes(' — ') ? template.name.split(' — ')[0] : (sector || '')} accent={unit.color} />

      <div className="mb-3">
        <Ticket accent={unit.color}>
          <Eyebrow>Nome do checklist</Eyebrow>
          <input
            value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Abertura — Salão"
            className="w-full mt-1 mb-3"
            style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 14, fontWeight: W.semibold, color: C.ink }}
          />
          <Eyebrow>Prazo (opcional)</Eyebrow>
          <input
            type="time" value={deadline} onChange={e => setDeadline(e.target.value)}
            className="mt-1"
            style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 14, fontWeight: W.semibold, color: C.ink }}
          />
        </Ticket>
      </div>

      <Eyebrow>Itens do checklist</Eyebrow>
      <p style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Use <span style={{ fontWeight: W.semibold }}>▲▼</span> ou arraste o <span style={{ fontWeight: W.semibold }}>≡</span> para reordenar. Toque no número para mover para uma posição específica.</p>
      <button
        onClick={addItemTop}
        className="flex items-center justify-center gap-2 w-full py-2.5 mt-2"
        style={{ borderRadius: 6, border: `1px dashed ${C.border}`, fontWeight: W.semibold, color: C.muted, background: 'none' }}
      >
        <Plus size={16} /> Adicionar item no topo
      </button>
      <div className="space-y-2 mt-2" id="item-list-container">
        {dragState && (
          <div style={{
            position: 'sticky', top: 8, zIndex: 10, textAlign: 'center',
            background: unit.color, color: 'white', borderRadius: 20,
            padding: '4px 14px', fontSize: 12, fontWeight: W.semibold,
            width: 'fit-content', margin: '0 auto 4px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          }}>
            → posição {dragState.overIndex + 1} de {items.length}
          </div>
        )}
        {items.map((item, index) => (
          <Ticket key={item.id} accent={item.critical ? C.critical : unit.color}
            data-item-index={index}
            style={{
              opacity: dragState?.id === item.id ? 0.35 : 1,
              outline: dragState && dragState.id !== item.id && dragState.overIndex === index
                ? `2px solid ${unit.color}` : 'none',
              outlineOffset: 2,
              transition: 'opacity 0.1s',
            }}
          >
            <div className="flex items-start gap-2">
              {/* Drag handle + position number */}
              <div className="flex flex-col items-center" style={{ flexShrink: 0, paddingTop: 2, gap: 2 }}>
                {/* Drag handle */}
                <div
                  onTouchStart={e => handleDragStart(e, item.id, index, 'touch')}
                  onMouseDown={e => handleDragStart(e, item.id, index, 'mouse')}
                  style={{ cursor: 'grab', padding: '2px 4px', touchAction: 'none', userSelect: 'none' }}
                  title="Arraste para reordenar"
                >
                  <span style={{ fontSize: 14, color: C.muted, lineHeight: 1 }}>≡</span>
                </div>
                {/* Setas: reordenar sem arrastar. Com card de ~563px, arrastar é
                    inviável no celular — e `moveItem` existia sem nenhum botão. */}
                <button onClick={() => moveItem(index, -1)} disabled={index === 0}
                  title="Mover para cima" aria-label="Mover para cima"
                  style={{ background: 'none', border: 'none', padding: '0 4px', lineHeight: 1,
                    fontSize: 11, color: index === 0 ? C.mutedLight : C.muted,
                    cursor: index === 0 ? 'default' : 'pointer' }}>▲</button>
                {/* Tappable position number */}
                <button
                  onClick={() => {
                    const dest = prompt(`Mover item "${item.text.slice(0,30)}…" para qual posição? (1–${items.length})`);
                    const n = parseInt(dest);
                    if (!isNaN(n) && n >= 1 && n <= items.length && n - 1 !== index) {
                      const next = [...items];
                      const [moved] = next.splice(index, 1);
                      next.splice(n - 1, 0, moved);
                      setItems(next);
                    }
                  }}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                  title="Toque para mover para posição específica"
                >
                  <span className="font-mono-ibr" style={{ fontSize: 10, color: unit.color, fontWeight: W.semibold, lineHeight: 1, textDecoration: 'underline dotted' }}>{index + 1}</span>
                </button>
                <button onClick={() => moveItem(index, 1)} disabled={index === items.length - 1}
                  title="Mover para baixo" aria-label="Mover para baixo"
                  style={{ background: 'none', border: 'none', padding: '0 4px', lineHeight: 1,
                    fontSize: 11, color: index === items.length - 1 ? C.mutedLight : C.muted,
                    cursor: index === items.length - 1 ? 'default' : 'pointer' }}>▼</button>
              </div>
              <textarea
                value={item.text}
                onChange={e => { updateItem(item.id, { text: e.target.value }); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                onFocus={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                placeholder="Descreva a tarefa" rows={1}
                className="flex-1"
                style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 14, color: C.ink, resize: 'none', overflow: 'hidden', lineHeight: 1.5 }}
              />
              <button onClick={() => removeItem(item.id)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                <X size={16} color={C.muted} />
              </button>
            </div>

            {/* Orientação expandida — texto, fotos, documentos POP, vídeo e link */}
            <ItemGuidanceEditor
              item={item} accent={unit.color}
              apply={fn => setItems(prev => prev.map(i => i.id === item.id ? { ...i, ...fn(i) } : i))}
            />
            <div className="flex flex-wrap gap-3 mt-2">
              <label
                className="flex items-center gap-1.5"
                style={{ fontSize: 11, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.06em', color: item.critical ? C.critical : C.muted }}
              >
                <input type="checkbox" checked={!!item.critical} onChange={e => updateItem(item.id, { critical: e.target.checked })} />
                Crítico
              </label>
              <label
                className="flex items-center gap-1.5"
                style={{ fontSize: 11, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.06em', color: item.required ? unit.color : C.muted }}
              >
                <input type="checkbox" checked={!!item.required} onChange={e => updateItem(item.id, { required: e.target.checked })} />
                Obrigatório (bloqueia avanço)
              </label>
              <label
                className="flex items-center gap-1.5"
                style={{ fontSize: 11, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.06em', color: item.photoRequired ? unit.color : C.muted }}
              >
                <input type="checkbox" checked={!!item.photoRequired} onChange={e => updateItem(item.id, { photoRequired: e.target.checked })} />
                Exigir foto
              </label>
            </div>
            <div className="mt-2">
              <p style={{ fontSize: 11, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted, marginBottom: 4 }}>
                {!item.recurrence || item.recurrence.length === 0 ? 'Todos os dias' : `Apenas: ${item.recurrence.map(d => WEEKDAY_LABELS[d]).join(', ')}`}
              </p>
              <div className="flex gap-1">
                {WEEKDAY_LABELS.map((label, day) => {
                  const rec = item.recurrence || [];
                  const active = rec.includes(day);
                  return (
                    <button
                      key={day}
                      onClick={() => {
                        const next = active ? rec.filter(d => d !== day) : [...rec, day].sort();
                        updateItem(item.id, { recurrence: next.length ? next : null });
                      }}
                      style={{
                        width: 30, height: 26, borderRadius: 4, fontSize: 11, fontWeight: W.semibold,
                        border: `1px solid ${C.border}`,
                        background: active ? unit.color : 'white',
                        color: active ? C.bg : C.muted,
                      }}
                    >
                      {label[0]}
                    </button>
                  );
                })}
              </div>
              {/* Carryover: a tarefa não feita volta amanhã até ser feita.
                  Opt-in porque arrastar é semântica da tarefa — "limpar a coifa"
                  é estado do mundo e arrasta; "conferir câmaras na abertura" é
                  momento do dia e não faz sentido cobrar depois.
                  Ligar CARIMBA a data: sem ela, a varredura de 7 dias alcançaria
                  ocorrências anteriores à regra e a tarefa estrearia cobrando
                  dívida de dias em que a cobrança não existia. Desligar limpa o
                  carimbo, para que religar depois não ressuscite o passado. */}
              <label
                className="flex items-center gap-1.5 mt-2"
                style={{ fontSize: 11, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.06em', color: item.carryover ? unit.color : C.muted }}
              >
                <input
                  type="checkbox"
                  checked={!!item.carryover}
                  onChange={e => updateItem(item.id, e.target.checked
                    ? { carryover: true, carryoverSince: todayStr(tzOf(unit)) }
                    : { carryover: false, carryoverSince: null })}
                />
                Se não for feita, cobrar no dia seguinte
              </label>
              {item.carryover && (
                <p style={{ marginTop: 4, fontSize: 11, color: C.muted, lineHeight: 1.4 }}>
                  Cobra a partir de {(item.carryoverSince || todayStr(tzOf(unit))).split('-').reverse().slice(0, 2).join('/')}, por até 7 dias. Dia de folga da loja não conta.
                </p>
              )}
            </div>

            {/* Aparece em — define em quais tipos de checklist este item aparece */}
            {siblingTemplates.length > 0 && (() => {
              const currentType = (() => {
                const n = (template?.name || '').toLowerCase();
                if (n.includes('abertura')) return 'abertura';
                if (n.includes('fechamento')) return 'fechamento';
                if (n.includes('intermedi')) return 'intermediario';
                return null;
              })();
              const ALL_TYPES = [
                { id: 'abertura', label: 'Abertura' },
                { id: 'fechamento', label: 'Fechamento' },
                { id: 'intermediario', label: 'Intermediário' },
              ];
              // Current appearsIn — default is [currentType] meaning only here
              const appearsIn = item.appearsIn || (currentType ? [currentType] : ALL_TYPES.map(t => t.id));
              return (
                <div className="mt-2" style={{ borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
                  <p style={{ fontSize: 11, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted, marginBottom: 6 }}>
                    Aparece em:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {ALL_TYPES.map(({ id, label }) => {
                      const active = appearsIn.includes(id);
                      return (
                        <button key={id}
                          onClick={() => {
                            const next = active
                              ? appearsIn.filter(t => t !== id)
                              : [...appearsIn, id];
                            // At least one must be selected
                            if (next.length === 0) return;
                            updateItem(item.id, { appearsIn: next });
                          }}
                          style={{
                            fontSize: 12, fontWeight: W.semibold, padding: '5px 12px', borderRadius: 20, cursor: 'pointer',
                            background: active ? unit.color : 'white',
                            color: active ? 'white' : C.muted,
                            border: `1.5px solid ${active ? unit.color : C.border}`,
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                          }}>
                          {active && <Check size={12} aria-hidden />}{label}
                        </button>
                      );
                    })}
                  </div>
                  {appearsIn.length === ALL_TYPES.length && (
                    <p style={{ fontSize: 10, color: C.muted, marginTop: 4, fontStyle: 'italic' }}>Aparece em todos os tipos</p>
                  )}
                </div>
              );
            })()}
          </Ticket>
        ))}
      </div>

      <button
        onClick={addItem}
        className="flex items-center justify-center gap-2 w-full py-2.5 mt-2"
        style={{ borderRadius: 6, border: `1px dashed ${C.border}`, fontWeight: W.semibold, color: C.muted, background: 'none' }}
      >
        <Plus size={16} /> Adicionar item
      </button>

      <div className="zc-actionbar fixed left-0 right-0 p-3 flex gap-2" style={{ bottom: "calc(var(--zc-nav-h) + env(safe-area-inset-bottom, 0px))", background: 'rgba(250,246,239,0.96)', borderTop: `1px solid ${C.border}`, zIndex: 90 }}>
        <button onClick={onCancel} className="flex-1 py-3" style={{ borderRadius: 6, border: `1px solid ${C.border}`, fontWeight: W.semibold, color: C.ink, background: 'white' }}>
          Cancelar
        </button>
        <button onClick={save} className="font-display flex-1 py-3" style={{ borderRadius: 6, border: 'none', fontWeight: W.semibold, color: C.bg, background: unit.color }}>
          Salvar checklist
        </button>
      </div>
    </div>
  );
}

/* ----------------------------- gerenciar view -------------------------------- */

/* ── Importar CSV — DENTRO do app (usa a sessão atual; antes era uma página
   separada que perdia o token e caía no login ao "Voltar"). ── */
/* O CSV cobre os MESMOS campos do editor "+ Novo" (pedido 18/07): critico,
   foto (exigir foto na execução), dias (da semana), orientacao, video, link,
   arrastar (a tarefa não feita volta no dia seguinte).
   Só fotos de referência e documentos ficam para anexar no app.
   O parser vive em lib/csvImport.js — compartilhado com a página /importar e
   tolerante ao que Excel/Numbers fazem com o arquivo (";" no lugar da vírgula,
   "Tarefa" com maiúscula, BOM, CRLF). */

/**
 * Importação em lote. Aceita vários CSVs de uma vez (ou colar um), e barra
 * checklist repetido em três frentes: contra o que já existe no banco, contra
 * o que veio duplicado no próprio lote, e por comparação normalizada — a
 * checagem antiga era igualdade exata, então "Abertura" e "abertura " entravam
 * como dois checklists distintos.
 */
function ImportCsvModal({ company, allUnits, templates, activeTypes = CHECKLIST_TYPE_ORDER, onSaveSector, onClose, onImported }) {
  const [csvText, setCsvText] = useState('');
  const [rawPreview, setRawPreview] = useState(null); // lista crua do arquivo
  const [criandoSetores, setCriandoSetores] = useState(false);
  const [warnings, setWarnings] = useState([]);
  const [loaded, setLoaded] = useState([]);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  // Fecha sozinho quando não sobrou nada para ler. O timer é cancelado se o
  // modal sair antes da hora (usuário clicou em Fechar).
  const closeTimer = useRef(null);
  useEffect(() => () => clearTimeout(closeTimer.current), []);

  const knownUnits = (allUnits || []).map(u => u.name).join(', ');
  const unitByName = useMemo(
    () => new Map((allUnits || []).map(u => [csvNorm(u.name), u])), [allUnits]);
  // Identidade de um checklist: loja + setor + nome, tudo normalizado.
  const dupKey = (unitId, sector, name) => `${unitId}|${csvNorm(sector)}|${csvNorm(name)}`;
  // O que a empresa já tem hoje, para marcar repetido ANTES de importar.
  const existentes = useMemo(
    () => new Set((templates || []).map(t => dupKey(t.unitId, t.sector, t.name))), [templates]);

  /** Loja inexistente, setor inexistente, repetido no banco e repetido no lote. */
  const classificar = (lista) => {
    const noLote = new Set();
    return lista.map(c => {
      const unitRow = unitByName.get(csvNorm(c.unitName));
      if (!unitRow) return { ...c, status: 'sem-loja' };
      // O app casa setor por igualdade exata (`t.sector === s`) contra os setores
      // da loja. Importar num setor que não existe cria um checklist ÓRFÃO: ele
      // conta no total do tipo mas não aparece em Gerenciar nem em Executar.
      // Antes isso era só um aviso DEPOIS de criar — agora barra antes.
      const setores = unitRow.sectors || [];
      if (setores.length && !setores.some(s => csvNorm(s) === csvNorm(c.sector))) {
        return { ...c, unitRow, status: 'sem-setor' };
      }
      const k = dupKey(unitRow.id, c.sector, c.name);
      if (existentes.has(k)) return { ...c, unitRow, key: k, status: 'ja-existe' };
      if (noLote.has(k)) return { ...c, unitRow, key: k, status: 'repetido-no-lote' };
      noLote.add(k);
      return { ...c, unitRow, key: k, status: 'novo' };
    });
  };

  // Derivado, não estado: reclassifica sozinho quando um setor ou uma loja é
  // criada durante a importação, sem depender de closure atualizado.
  const preview = useMemo(
    () => (rawPreview ? classificar(rawPreview) : null),
    [rawPreview, allUnits, templates]);

  const parse = (text) => {
    setError(''); setResult(null); setRawPreview(null); setWarnings([]); setLoaded([]);
    const r = parseImportCSV(text ?? csvText);
    setWarnings(r.warnings || []);
    if (r.error) { setError(r.error); return; }
    setRawPreview(r.checklists.map(c => ({ ...c, source: null })));
  };

  /**
   * Lote: lê todos os arquivos escolhidos de uma vez. Um arquivo com problema
   * não derruba os outros — vira erro nomeado na lista, e o resto segue.
   */
  const onFile = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = ''; // permite reescolher os mesmos arquivos depois
    if (!files.length) return;
    setError(''); setResult(null); setRawPreview(null); setWarnings([]); setCsvText('');
    setReading(true);
    const todos = []; const avisos = []; const falhas = []; const lidos = [];
    for (const f of files) {
      let texto;
      try { texto = await f.text(); }
      catch (_) { falhas.push(`${f.name}: não foi possível ler o arquivo.`); continue; }
      const r = parseImportCSV(texto);
      (r.warnings || []).forEach(w => avisos.push(`${f.name} — ${w}`));
      if (r.error) { falhas.push(`${f.name}: ${r.error}`); continue; }
      r.checklists.forEach(c => todos.push({ ...c, source: f.name }));
      lidos.push({ name: f.name, checklists: r.checklists.length, itens: r.checklists.reduce((s, c) => s + c.items.length, 0) });
    }
    setReading(false);
    setWarnings([...falhas, ...avisos]);
    setLoaded(lidos);
    if (!todos.length) {
      setError(files.length > 1
        ? 'Nenhum checklist encontrado nos arquivos selecionados.'
        : (falhas[0] || 'Nenhum checklist encontrado.'));
      return;
    }
    setRawPreview(todos);
  };

  // O modelo sai com a loja e o setor REAIS da empresa: baixar e importar sem
  // editar precisa funcionar. Com "Loja 1"/"Salão" fixos dava sempre 0 importados.
  const baixarModelo = () => {
    const u = (allUnits || [])[0];
    const csv = buildModelCsv({
      loja: u?.name || undefined,
      setor: u?.sectors?.[0] || undefined,
      tipoAbertura: activeTypes.find(t => csvNorm(t.label).includes('abertura'))?.label || 'Abertura',
      tipoFechamento: activeTypes.find(t => csvNorm(t.label).includes('fechamento'))?.label || 'Fechamento',
    });
    const a = document.createElement('a');
    // BOM: sem ele o Excel abre "Salão" como "SalÃ£o".
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'zcheck-modelo.csv'; a.click();
  };

  const novos = (preview || []).filter(c => c.status === 'novo');
  // Setores que o CSV pede e a empresa não tem — viram um botão de criar.
  const setoresFaltantes = [...new Map(
    (preview || [])
      .filter(c => c.status === 'sem-setor')
      .map(c => [`${c.unitRow.id}|${csvNorm(c.sector)}`, { unit: c.unitRow, nome: c.sector }])
  ).values()];

  const criarSetoresFaltantes = async () => {
    if (!setoresFaltantes.length || !onSaveSector) return;
    setCriandoSetores(true);
    try {
      for (const s of setoresFaltantes) {
        await onSaveSector({ id: uid(), companyId: company.id, unitId: s.unit.id, name: s.nome });
      }
      showToast(`${setoresFaltantes.length} setor${setoresFaltantes.length > 1 ? 'es criados' : ' criado'}!`);
      // Nada de reclassificar à mão: `preview` é derivado de allUnits, então
      // o setor novo entra sozinho no próximo render (a prop chega do pai).
    } catch (e) {
      console.error(e);
      showToast(`Não foi possível criar o setor: ${e?.message || 'tente de novo.'}`);
    }
    setCriandoSetores(false);
  };

  const doImport = async () => {
    if (!novos.length) return;
    setImporting(true); setResult(null);
    try {
      const { authedSupabase } = await import('../../lib/supabase');
      const db = authedSupabase();
      // Recarrega a lista do banco na hora de gravar: entre abrir o modal e
      // clicar em Importar, outra pessoa pode ter criado o mesmo checklist.
      const { data: atuais } = await db.from('templates')
        .select('unit_id, sector, name').eq('company_id', company.id);
      const jaNoBanco = new Set((atuais || []).map(t => dupKey(t.unit_id, t.sector, t.name)));

      let created = 0, skipped = 0;
      const problems = [];
      for (const tpl of novos) {
        if (jaNoBanco.has(tpl.key)) {
          problems.push(`"${tpl.name}" (${tpl.unitRow.name} / ${tpl.sector}): já existe — não foi duplicado.`);
          skipped++; continue;
        }
        const { error: insErr } = await db.from('templates').insert({
          id: tpl.id, company_id: company.id, unit_id: tpl.unitRow.id, sector: tpl.sector, name: tpl.name,
          shift: csvNorm(tpl.name).includes('abertura') ? 'Manhã' : csvNorm(tpl.name).includes('fechamento') ? 'Tarde' : ['Manhã', 'Tarde'],
          deadline: tpl.deadline, items: tpl.items,
        });
        // Antes o erro do banco era descartado e virava um "ignorado" sem motivo.
        if (insErr) { problems.push(`"${tpl.name}": ${insErr.message}`); skipped++; continue; }
        jaNoBanco.add(tpl.key); // trava o repetido dentro do próprio lote
        created++;
        // Criou, mas pode nascer invisível na aba Executar — avisa em vez de sumir.
        const setores = tpl.unitRow.sectors || [];
        if (setores.length && !setores.some(s => csvNorm(s) === csvNorm(tpl.sector))) {
          problems.push(`"${tpl.name}" foi criado, mas o setor "${tpl.sector}" não existe em ${tpl.unitRow.name} — crie o setor em Estrutura para ele aparecer em Executar.`);
        }
        if (!activeTypes.some(t => t.match({ name: tpl.name }))) {
          problems.push(`"${tpl.name}" foi criado, mas o nome não corresponde a nenhum tipo de checklist (${activeTypes.map(t => t.label).join(', ')}) — ele não vai aparecer em Executar.`);
        }
      }
      const limpo = created > 0 && skipped === 0 && problems.length === 0;
      setResult({ created, skipped, problems, limpo });
      if (created > 0) {
        // Some o CSV da tela: sem isso o botão "Importar" continuava armado e
        // dava para reimportar o mesmo arquivo por engano.
        setCsvText(''); setRawPreview(null); setWarnings([]); setLoaded([]);
        await onImported?.();
        showToast(`${created} checklist${created > 1 ? 's' : ''} importado${created > 1 ? 's' : ''}!`);
        // Deu tudo certo e não há aviso para ler: confirma e fecha sozinho.
        // Com pendências, o modal fica aberto até o usuário ler e fechar.
        if (limpo) closeTimer.current = setTimeout(() => onClose?.(), 1800);
      }
    } catch (e) {
      console.error(e);
      setResult({ error: `Erro na importação: ${e?.message || 'tente novamente.'}` });
    }
    setImporting(false);
  };

  const BADGE = {
    'novo':             { texto: 'novo',                cor: C.success },
    'ja-existe':        { texto: 'já existe — ignorado', cor: C.muted },
    'repetido-no-lote': { texto: 'repetido no lote',     cor: C.warning },
    'sem-loja':         { texto: 'loja não encontrada',  cor: C.critical },
    'sem-setor':        { texto: 'setor não existe',      cor: C.critical },
  };
  const bloqueados = (preview || []).length - novos.length;

  return (
    <div className="zc-sheet" style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(8,20,30,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 0 }} onClick={onClose}>
      <div className="zc-sheet-panel" style={{ width: '100%', maxWidth: 560, background: C.bg, borderRadius: '20px 20px 0 0', maxHeight: '92vh', overflowY: 'auto', padding: 20, paddingBottom: 'calc(20px + env(safe-area-inset-bottom,0px))' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
          <h2 style={{ fontSize: 18, fontWeight: W.semibold, color: C.ink }}>Importar checklists via CSV</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted }}><X size={20} /></button>
        </div>
        <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.6, marginBottom: 12 }}>
          Colunas: <strong>tipo, checklist, loja, setor, tarefa, critico, foto, dias, orientacao, video, link, deadline, arrastar</strong>.
          A coluna <strong>loja</strong> precisa bater com uma loja da empresa ({knownUnits || '—'}).
          {' '}<strong>foto</strong> = &quot;sim&quot; exige foto na execução; <strong>dias</strong> = &quot;seg qua sex&quot; (vazio = todos os dias);
          {' '}<strong>arrastar</strong> = &quot;sim&quot; faz a tarefa não feita voltar no dia seguinte até ser executada;
          texto com vírgula vai entre aspas. Fotos de referência e documentos você anexa depois, no app.
          {' '}Aceita separador vírgula, ponto e vírgula ou tabulação — pode salvar direto do Excel, do Numbers ou do Google Sheets.
          {' '}<strong>Pode selecionar vários arquivos de uma vez.</strong>
        </p>
        <div className="flex gap-2" style={{ marginBottom: 10 }}>
          <label style={{ padding: '8px 14px', borderRadius: 8, border: `1.5px solid ${C.border}`, background: 'white', color: C.ink, fontWeight: W.semibold, fontSize: 13, cursor: 'pointer' }}>
            {reading ? 'Lendo…' : 'Carregar arquivos'}
            <input type="file" accept=".csv,text/csv" multiple onChange={onFile} style={{ display: 'none' }} />
          </label>
          <button onClick={baixarModelo} style={{ padding: '8px 14px', borderRadius: 8, border: `1.5px solid ${C.border}`, background: 'white', color: C.ink, fontWeight: W.semibold, fontSize: 13, cursor: 'pointer' }}>Baixar modelo</button>
        </div>

        {/* Arquivos lidos no lote */}
        {loaded.length > 0 && !result && (
          <div style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, marginBottom: 10 }}>
            <p style={{ fontSize: 12, fontWeight: W.semibold, color: C.ink, marginBottom: 4 }}>
              {loaded.length} arquivo{loaded.length > 1 ? 's' : ''} lido{loaded.length > 1 ? 's' : ''}
            </p>
            {loaded.map(f => (
              <p key={f.name} style={{ fontSize: 12, color: C.muted }}>• {f.name} — {f.checklists} checklist(s), {f.itens} tarefas</p>
            ))}
          </div>
        )}

        {!loaded.length && (
          <textarea value={csvText} onChange={e => { setCsvText(e.target.value); }} onBlur={() => csvText && parse(csvText)}
            placeholder="…ou cole o CSV aqui" rows={6}
            style={{ width: '100%', fontSize: 13, fontFamily: 'ui-monospace, monospace', color: C.ink, background: 'white', padding: 12, border: `1.5px solid ${C.border}`, borderRadius: 10, outline: 'none', resize: 'vertical', marginBottom: 10 }} />
        )}

        {error && <p style={{ fontSize: 13, fontWeight: W.semibold, color: C.critical, marginBottom: 10 }}>{error}</p>}
        {/* Linhas descartadas na leitura — antes sumiam em silêncio. */}
        {warnings.length > 0 && (
          <div style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, marginBottom: 10 }}>
            <p style={{ fontSize: 12, fontWeight: W.semibold, color: C.ink, marginBottom: 4 }}>Avisos na leitura</p>
            {warnings.map((w, i) => (
              <p key={i} style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>• {w}</p>
            ))}
          </div>
        )}
        {preview && !result && (
          <div style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, marginBottom: 10 }}>
            <p style={{ fontSize: 13, fontWeight: W.semibold, color: C.ink, marginBottom: 6 }}>
              {novos.length} a importar{bloqueados > 0 ? ` · ${bloqueados} bloqueado${bloqueados > 1 ? 's' : ''}` : ''}
            </p>
            {preview.map(p => {
              const b = BADGE[p.status];
              return (
                <div key={p.id} style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
                  <p style={{ fontSize: 12, color: p.status === 'novo' ? C.ink : C.muted, flex: 1 }}>
                    {p.name} · {p.unitName} / {p.sector} · {p.items.length} itens
                    {p.source ? <span style={{ color: C.mutedLight }}> · {p.source}</span> : null}
                  </p>
                  <span style={{ fontSize: 10, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.05em', color: b.cor, whiteSpace: 'nowrap' }}>{b.texto}</span>
                </div>
              );
            })}
            {/* Setor inexistente é o único bloqueio que dá para resolver aqui
                mesmo — sem isso o gestor teria de sair, criar em Estrutura e
                recomeçar a importação. */}
            {setoresFaltantes.length > 0 && onSaveSector && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, marginBottom: 8 }}>
                  {setoresFaltantes.length === 1
                    ? `O setor "${setoresFaltantes[0].nome}" não existe em ${setoresFaltantes[0].unit.name}.`
                    : `${setoresFaltantes.length} setores do arquivo não existem: ${setoresFaltantes.map(s => `"${s.nome}"`).join(', ')}.`}
                  {' '}Sem ele o checklist seria criado mas não apareceria em lugar nenhum.
                </p>
                <button onClick={criarSetoresFaltantes} disabled={criandoSetores}
                  style={{ width: '100%', padding: 10, borderRadius: 8, border: 'none', background: criandoSetores ? C.muted : C.ink, color: 'white', fontWeight: 800, fontSize: 13, cursor: criandoSetores ? 'not-allowed' : 'pointer' }}>
                  {criandoSetores ? 'Criando…' : setoresFaltantes.length === 1 ? `Criar setor "${setoresFaltantes[0].nome}"` : `Criar os ${setoresFaltantes.length} setores`}
                </button>
              </div>
            )}
            {bloqueados > 0 && (
              <p style={{ fontSize: 11, color: C.muted, marginTop: 8, lineHeight: 1.5 }}>
                Checklist repetido não é importado de novo — a comparação ignora maiúsculas e acentos.
                Para substituir um que já existe, edite-o em Checklists ou apague antes de importar.
              </p>
            )}
          </div>
        )}
        {result && (
          <div style={{ marginBottom: 10 }}>
            <p style={{ fontSize: result.error ? 13 : 15, fontWeight: W.semibold, color: result.error ? C.critical : (result.created > 0 ? C.success : C.critical) }}>
              {result.error
                ? result.error
                : result.created > 0
                  ? `Importação concluída — ${result.created} checklist${result.created > 1 ? 's' : ''} criado${result.created > 1 ? 's' : ''}${result.skipped > 0 ? `, ${result.skipped} ignorado${result.skipped > 1 ? 's' : ''}` : ''}.`
                  : `Nenhum checklist importado (${result.skipped} ignorado${result.skipped !== 1 ? 's' : ''}).`}
            </p>
            {result.limpo && (
              <p style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Fechando…</p>
            )}
            {/* O motivo de cada checklist que não entrou (ou que entrou torto). */}
            {result.problems?.length > 0 && (
              <div style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, marginTop: 8 }}>
                {result.problems.map((p, i) => (
                  <p key={i} style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>• {p}</p>
                ))}
              </div>
            )}
          </div>
        )}
        {/* Depois de importar, "Concluir" vira a ação principal: o que sobrou na
            tela é o resultado, não mais um arquivo esperando importação. */}
        {result?.created > 0 ? (
          <button onClick={onClose}
            style={{ width: '100%', padding: 12, borderRadius: 10, border: 'none', background: C.success, color: 'white', fontWeight: W.semibold, fontSize: 14, cursor: 'pointer' }}>
            Concluir
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={onClose} style={{ flex: 1, padding: 12, borderRadius: 10, border: `1.5px solid ${C.border}`, background: 'white', color: C.ink, fontWeight: W.semibold, fontSize: 14, cursor: 'pointer' }}>Fechar</button>
            <button onClick={doImport} disabled={!novos.length || importing}
              style={{ flex: 2, padding: 12, borderRadius: 10, border: 'none', background: (!novos.length || importing) ? C.muted : C.ink, color: 'white', fontWeight: W.semibold, fontSize: 14, cursor: (!novos.length || importing) ? 'not-allowed' : 'pointer' }}>
              {importing ? 'Importando…' : novos.length > 1 ? `Importar ${novos.length} checklists` : 'Importar'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function GerenciarView({ unit, templates, onSaveTemplates, closures, onSaveClosures, canSeeAllUnits, usersPanel, checklistTypes, allUnits, onSaveUnit, onSaveSector, onSaveChecklistType, onDeleteChecklistType, onDeleteSector, onDeleteUnit, onSaveCompany, onReloadTemplates, company, activeTypes = CHECKLIST_TYPE_ORDER }) {
  const [showImport, setShowImport] = useState(false);
  const [headerLogoBusy, setHeaderLogoBusy] = useState(false);

  // Mesmo fluxo do logo em Estrutura > Lojas, acessível direto do cabeçalho.
  const onPickHeaderLogo = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    e.target.value = '';
    setHeaderLogoBusy(true);
    try {
      const m = await import('../../lib/sync');
      const url = await m.uploadCompanyLogo(company.id, f);
      await onSaveCompany?.({ logoUrl: url });
      showToast('Logo atualizado!');
    } catch (err) { console.error(err); alert('Não foi possível subir o logo. Tente uma imagem PNG/JPG menor.'); }
    finally { setHeaderLogoBusy(false); }
  };
  const onRemoveHeaderLogo = async () => {
    if (!confirm('Remover o logo da empresa?')) return;
    setHeaderLogoBusy(true);
    try { await onSaveCompany?.({ logoUrl: null }); showToast('Logo removido.'); }
    catch (e) { console.error(e); } finally { setHeaderLogoBusy(false); }
  };
  const [gerenciarTab, setGerenciarTab] = useState('editar'); // 'editar' | 'novo' | 'estrutura'
  const [checklistType, setChecklistType] = useState(null);
  const [sector, setSector] = useState(null);
  const [editing, setEditing] = useState(null);
  const [mdQuery, setMdQuery] = useState('');   // busca da lista lateral (desktop)
  const [showFolgas, setShowFolgas] = useState(false);

  // Novo checklist form state
  const [novoName, setNovoName] = useState('');
  const [novoType, setNovoType] = useState('');
  const [novoCustomType, setNovoCustomType] = useState('');
  const [novoUnit, setNovoUnit] = useState(unit.id);
  const [novoSector, setNovoSector] = useState('');
  const [novoDeadline, setNovoDeadline] = useState('');
  const [novoItems, setNovoItems] = useState([{ id: uid(), text: '', critical: false, required: false, photoRequired: false, recurrence: null }]);
  const [novoOptsOpen, setNovoOptsOpen] = useState({}); // itemId → opções (foto/dias) expandidas
  const [novoGuidanceOpen, setNovoGuidanceOpen] = useState({}); // itemId → orientação expandida
  const [novoSaving, setNovoSaving] = useState(false);
  const [novoSuccess, setNovoSuccess] = useState(false);

  // ── "+ Novo": três caminhos, uma entrada ────────────────────────────────────
  // null = tela de escolha · 'biblioteca' | 'duplicar' | 'zero'
  // Hierarquia deliberada (arquitetura de informação): modelo pronto é o
  // primário — resolve a página em branco; do zero é o terciário.
  const [novoMode, setNovoMode] = useState(null);
  const [libVertical, setLibVertical] = useState(null);
  const [libPreview, setLibPreview] = useState(null);   // modelo aberto no preview
  const [libUnit, setLibUnit] = useState(unit.id);
  const [libSector, setLibSector] = useState('');
  const [dupSource, setDupSource] = useState(null);     // template existente a copiar
  const [dupUnit, setDupUnit] = useState(unit.id);
  const [dupSector, setDupSector] = useState('');

  const unitsForPick = allUnits?.length > 0 ? allUnits : UNITS;
  const sectorsOf = uId => (unitsForPick.find(u => u.id === uId) || unit)?.sectors || unit.sectors;

  const flashSuccess = () => {
    setNovoSuccess(true);
    setTimeout(() => setNovoSuccess(false), 4000);
    showToast('Checklist criado! Ajuste em "Checklists".');
  };

  // Adotar = cópia profunda com ids novos. Nunca vínculo com o modelo-mãe:
  // toda operação diverge do padrão no dia 2, e vínculo criaria medo de editar.
  const handleAdopt = () => {
    if (!libPreview || !libSector) return;
    const m = libPreview.momento;
    const newTpl = {
      id: uid(), unitId: libUnit, sector: libSector,
      name: `${libPreview.area} — ${m}`,
      deadline: libPreview.deadline || null,
      shift: m.toLowerCase().includes('abertura') ? 'Manhã'
        : m.toLowerCase().includes('fechamento') ? 'Tarde'
        : ['Manhã', 'Tarde'],
      items: libPreview.items.map(i => ({
        id: uid(), text: i.text, critical: !!i.critical,
        ...(i.photoRequired ? { photoRequired: true } : {}),
      })),
    };
    Promise.resolve(onSaveTemplates([...templates, newTpl])).catch(() => {});
    // Mede quais verticais adotam — é o dado que orienta a próxima curadoria.
    track('template_adopted', { source: 'library', unitId: libUnit,
      metadata: { library_id: libPreview.id, vertical: libPreview.vertical, momento: m } });
    setLibPreview(null); setLibSector('');
    setNovoMode(null);
    flashSuccess();
  };

  const handleDuplicate = () => {
    if (!dupSource || !dupSector) return;
    const newTpl = {
      ...dupSource,
      id: uid(), unitId: dupUnit, sector: dupSector,
      name: `${dupSource.name} (cópia)`,
      items: (dupSource.items || []).map(i => ({ ...i, id: uid() })),
    };
    Promise.resolve(onSaveTemplates([...templates, newTpl])).catch(() => {});
    setDupSource(null); setDupSector('');
    setNovoMode(null);
    flashSuccess();
  };

  const activeSector = sector || unit.sectors[0];
  const [saveSuccess, setSaveSuccess] = useState(false);

  // All available types — dynamic from DB + hardcoded fallback
  const availableTypes = checklistTypes?.length > 0
    ? checklistTypes
    : [
        { id: 'abertura', name: 'Abertura' },
        { id: 'intermediario', name: 'Intermediário' },
        { id: 'fechamento', name: 'Fechamento' },
      ];

  // Sectors for selected unit in Novo form
  const novoUnitObj = (allUnits || [UNITS.find(u => u.id === novoUnit)]).find(u => u.id === novoUnit) || unit;
  const novoSectorOptions = novoUnitObj?.sectors || unit.sectors;

  // O que ainda falta para poder criar — vira dica visível sob o botão.
  const novoMissing = [];
  if (!novoType) novoMissing.push('escolher o tipo de checklist');
  else if (novoType === '__custom__' && !novoCustomType.trim()) novoMissing.push('dar nome ao tipo livre');
  if (!novoSector) novoMissing.push('escolher o setor');
  if (novoItems.filter(i => i.text.trim()).length === 0) novoMissing.push('descrever pelo menos uma tarefa');

  const handleSaveNovo = async () => {
    if (novoMissing.length) return;
    const typeName = novoType === '__custom__' ? novoCustomType.trim() : (availableTypes.find(t => t.id === novoType)?.name || novoType);
    if (!typeName || !novoSector || novoItems.filter(i => i.text.trim()).length === 0) return;
    // Tipo livre: registra também em checklist_types. Sem isso o ACTIVE_TYPES
    // nunca conhece o tipo e o checklist não aparece na aba Executar (bug 20/07).
    if (novoType === '__custom__') {
      const exists = (checklistTypes || []).some(t => (t.name || '').trim().toLowerCase() === typeName.toLowerCase());
      if (!exists) {
        onSaveChecklistType?.({ id: uid(), companyId: company?.id || 'ibr', name: typeName, sortOrder: (checklistTypes?.length || 0) + 1 });
      }
    }
    setNovoSaving(true);
    const cleanItems = novoItems.filter(i => i.text.trim()).map(i => ({ ...i, text: i.text.trim() }));
    const praça = novoName.trim();
    const templateName = praça ? `${praça} — ${typeName}` : typeName;
    const newTpl = {
      id: uid(), unitId: novoUnit, sector: novoSector,
      name: templateName, deadline: novoDeadline || null,
      shift: typeName.toLowerCase().includes('abertura') ? 'Manhã'
        : typeName.toLowerCase().includes('fechamento') ? 'Tarde'
        : ['Manhã', 'Tarde'],
      items: cleanItems,
    };
    // Espera a gravação: o toast de sucesso saía antes de saber se o banco
    // tinha aceitado, e o formulário era limpo de qualquer jeito — quem perdia
    // a gravação perdia junto o que tinha digitado.
    try {
      await onSaveTemplates([...templates, newTpl]);
    } catch (_) {
      setNovoSaving(false);   // saveTemplates já avisou o motivo no toast
      return;                 // mantém o formulário preenchido para tentar de novo
    }
    setNovoSuccess(true);
    showToast('Checklist criado! Ajuste em "Checklists".');
    setNovoName(''); setNovoType(''); setNovoCustomType('');
    setNovoSector(''); setNovoDeadline('');
    setNovoItems([{ id: uid(), text: '', critical: false, required: false, photoRequired: false, recurrence: null }]);
    setNovoSaving(false);
    setTimeout(() => setNovoSuccess(false), 3000);
  };

  const handleSave = async tpl => {
    const { copies, ...tplData } = tpl;
    let next;
    if (tplData.id) {
      const currentType = (() => {
        const n = (tplData.name || '').toLowerCase();
        if (n.includes('abertura')) return 'abertura';
        if (n.includes('fechamento')) return 'fechamento';
        if (n.includes('intermedi')) return 'intermediario';
        return null;
      })();
      // Normalize: remove appearsIn if it only contains current type (redundant)
      tplData.items = tplData.items.map(item => {
        if (!item.appearsIn || item.appearsIn.length === 0) return item;
        // If appearsIn only has current type, it's just "here" — keep it to signal intent
        return item;
      });
      // Se o checklist editado não está na lista local (refetch trocou a lista,
      // troca de loja, id divergente), o map() devolveria tudo intacto e a
      // edição sumiria em silêncio. Reinserir preserva o trabalho.
      next = templates.some(t => t.id === tplData.id)
        ? templates.map(t => t.id === tplData.id ? { ...t, ...tplData } : t)
        : [...templates, { ...tplData, unitId: tplData.unitId ?? unit.id, sector: tplData.sector ?? activeSector }];
    } else {
      next = [...templates, { ...tplData, id: uid(), unitId: unit.id, sector: activeSector, shift: tplData.shift }];
    }

    // Propagate appearsIn changes to sibling templates (same praça, different type)
    if (tplData.id) {
      const currentTpl = next.find(t => t.id === tplData.id);
      const pracaPrefix = currentTpl.name.includes(' — ') ? currentTpl.name.split(' — ')[0] : null;

      if (pracaPrefix) {
        const TYPE_MAP = { 'abertura': 'abertura', 'fechamento': 'fechamento', 'intermediario': 'intermediario' };
        const getType = name => {
          const n = name.toLowerCase();
          if (n.includes('abertura')) return 'abertura';
          if (n.includes('fechamento')) return 'fechamento';
          if (n.includes('intermedi')) return 'intermediario';
          return null;
        };

        next = next.map(sibling => {
          if (sibling.id === tplData.id) return sibling; // skip self
          const siblingPraca = sibling.name.includes(' — ') ? sibling.name.split(' — ')[0] : null;
          if (siblingPraca !== pracaPrefix || sibling.sector !== currentTpl.sector) return sibling;
          const siblingType = getType(sibling.name);
          if (!siblingType) return sibling;

          let siblingItems = [...(sibling.items || [])];

          // Process each item in the saved template
          tplData.items.forEach(item => {
            const appearsIn = item.appearsIn;
            if (!appearsIn || appearsIn.length === 0) return; // no appearsIn = only in current template

            const shouldBeInSibling = appearsIn.includes(siblingType);
            const existingIdx = siblingItems.findIndex(si => si.text.trim() === item.text.trim());

            if (shouldBeInSibling && existingIdx === -1) {
              // Add to sibling — strip appearsIn from the copy (it's native there)
              const { appearsIn: _, ...itemWithoutAppearsIn } = item;
              siblingItems.push({ ...itemWithoutAppearsIn, id: uid() });
            } else if (!shouldBeInSibling && existingIdx !== -1) {
              // Remove from sibling
              siblingItems.splice(existingIdx, 1);
            }
          });

          // Also check: items that are in sibling but were removed from current template entirely
          const currentTexts = new Set(tplData.items.map(i => i.text.trim()));
          // (Items not in current template at all are left alone in sibling — they may be native there)

          return { ...sibling, items: siblingItems };
        });
      }
    }

    // Collect IDs of all modified templates
    const changedIds = [tplData.id, ...Object.keys({})].filter(Boolean);
    if (tplData.id) {
      next.forEach(t => {
        if (t.id !== tplData.id) {
          const orig = templates.find(o => o.id === t.id);
          if (orig && JSON.stringify(orig.items) !== JSON.stringify(t.items)) {
            changedIds.push(t.id);
          }
        }
      });
    }

    // Aguarda de verdade: fechar o editor e piscar "salvo" antes da resposta do
    // banco fazia uma tarefa recusada sumir da tela como se tivesse gravado.
    try {
      await onSaveTemplates(next, changedIds.length ? changedIds : null);
    } catch (_) {
      return;   // saveTemplates já mostrou o motivo; o editor fica aberto
    }
    setEditing(null);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  /**
   * Remover checklist DESATIVA — não apaga.
   *
   * `delete` reescrevia o passado: as execuções ficavam órfãs em `completions` e
   * o "previstos" de dias já fechados encolhia, porque ele é contado da lista
   * atual de checklists. A aderência de uma semana fechada mudava sozinha.
   *
   * E o erro morria num `catch` vazio: uma falha de RLS tirava o checklist da
   * tela sem tirar do banco, e ele voltava no próximo carregamento.
   */
  const handleDelete = async id => {
    const alvo = templates.find(t => t.id === id);
    if (!confirm(`Remover "${alvo?.name || 'este checklist'}"?\n\nEle sai da operação, mas o histórico de execuções é preservado — e dá para reativar depois.`)) return;
    try {
      const { legacy } = await deactivateTemplate(id);
      if (legacy) showToast('Checklist removido (histórico não preservado — migration pendente).');
      else showToast('Checklist desativado. O histórico foi preservado.');
    } catch (e) {
      console.error('handleDelete', e);
      showToast(`Não foi possível remover: ${e?.message || 'tente de novo'}`);
      return;   // a lista NÃO muda: o banco recusou
    }
    // Só sai da lista local depois que o banco confirmou.
    Promise.resolve(onSaveTemplates(
      templates.map(t => (t.id === id ? { ...t, active: false, deactivatedAt: new Date().toISOString() } : t)),
      [id],
    )).catch(() => {});
  };

  if (editing) {
    /**
     * Mestre-detalhe no desktop (item 9 do estudo). Editar 5 checklists custava
     * 15 navegações: tipo → setor → lista → editor, e a volta pela BackBar a
     * cada troca. Com a lista ao lado, trocar de checklist é um clique e o
     * efeito da edição aparece na contagem lateral na hora.
     *
     * A lista aqui é escrita de novo, não é o JSX de cartões do celular movido
     * para cá: em 360px a régua é outra — linha densa, não cartão. Mover o
     * código do mobile daria uma lista boa para o dedo e ruim para o painel, e
     * ainda arriscaria o caminho que já funciona.
     *
     * `.zc-md-list` some abaixo de 1024px, então no celular o editor continua
     * ocupando a tela inteira, exatamente como hoje.
     */
    // Busca por nome OU setor, sem acento e sem caixa: quem procura "salao"
    // deve achar "Salão", e quem lembra do setor mas não do nome também acha.
    const norm = v => (v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const q = norm(mdQuery.trim());
    const doTipoTodos = templates
      .filter(t => t.unitId === unit.id && (!checklistType || activeTypes.find(c => c.key === checklistType)?.match(t)))
      .sort((a, b) => (a.sector || '').localeCompare(b.sector || '', 'pt-BR') || a.name.localeCompare(b.name, 'pt-BR'));
    const doTipo = q
      ? doTipoTodos.filter(t => norm(t.name).includes(q) || norm(t.sector).includes(q))
      : doTipoTodos;
    const porSetor = [];
    for (const t of doTipo) {
      const last = porSetor[porSetor.length - 1];
      if (last && last.setor === t.sector) last.items.push(t);
      else porSetor.push({ setor: t.sector, items: [t] });
    }

    // Sem nada para listar (loja recém-criada, ou tipo ainda sem checklist), a
    // coluna de 360px fica vazia e só empurra o editor para o lado. Nesse caso
    // não há mestre-detalhe a fazer: o editor ocupa a largura, como no celular.
    if (porSetor.length === 0) {
      return (
        <TemplateEditor
          unit={unit} sector={activeSector}
          template={editing === 'new' ? null : editing}
          checklistType={checklistType}
          allTemplates={templates}
          onSave={handleSave} onCancel={() => { setMdQuery(''); setEditing(null); }}
        />
      );
    }

    return (
      <div className="zc-md">
        <aside className="zc-md-list" aria-label="Checklists desta unidade">
          {/* A busca só aparece quando há lista o bastante para justificá-la —
              com 4 checklists o campo é mais cromo que ajuda. */}
          {doTipoTodos.length >= 8 && (
            <div className="zc-md-search">
              <label htmlFor="zc-md-q" className="sr-only">Buscar checklist</label>
              <input
                id="zc-md-q" type="search" value={mdQuery}
                onChange={e => setMdQuery(e.target.value)}
                placeholder={`Buscar entre ${doTipoTodos.length} checklists…`}
                style={{
                  width: '100%', padding: '9px 12px', fontSize: T.bodySm, color: C.ink,
                  background: '#fff', border: `1px solid ${C.borderStrong}`, borderRadius: R.sm,
                  fontFamily: 'inherit',
                }} />
              {q && (
                <p style={{ fontSize: T.label, color: C.mutedLight, margin: '6px 2px 0' }}>
                  {doTipo.length === 0
                    ? 'Nenhum checklist com esse termo'
                    : `${doTipo.length} de ${doTipoTodos.length}`}
                </p>
              )}
            </div>
          )}
          {porSetor.map(g => (
            <div key={g.setor} style={{ marginBottom: 14 }}>
              <p style={{
                fontSize: T.label, fontWeight: W.semibold, textTransform: 'uppercase',
                letterSpacing: '0.06em', color: C.mutedLight, padding: '0 2px 6px',
              }}>{g.setor}</p>
              <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: R.md, overflow: 'hidden' }}>
                {g.items.map((t, i) => {
                  const ativo = editing !== 'new' && editing?.id === t.id;
                  const label = t.name.includes(' — ') ? t.name.split(' — ')[0] : t.name;
                  const criticos = t.items.filter(it => it.critical).length;
                  return (
                    <button key={t.id} onClick={() => { setSector(t.sector); setEditing(t); }}
                      aria-current={ativo ? 'true' : undefined}
                      style={{
                        width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
                        padding: '10px 14px', fontFamily: 'inherit', display: 'block',
                        borderTop: i > 0 ? `1px solid ${C.border}` : 'none',
                        background: ativo ? C.bg : '#fff',
                        boxShadow: ativo ? `inset 3px 0 0 ${unit.color}` : 'none',
                      }}>
                      <span style={{ display: 'block', fontSize: T.bodySm, fontWeight: ativo ? W.semibold : W.medium, color: C.ink }}>{label}</span>
                      <span style={{ display: 'block', fontSize: T.label, color: C.mutedLight, marginTop: 2 }}>
                        {t.items.length} {t.items.length === 1 ? 'item' : 'itens'}
                        {criticos ? ` · ${criticos} ${criticos === 1 ? 'crítico' : 'críticos'}` : ''}
                        {t.deadline ? ` · até ${t.deadline}` : ''}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </aside>

        <div className="zc-md-detail">
          <TemplateEditor
            unit={unit} sector={activeSector}
            template={editing === 'new' ? null : editing}
            checklistType={checklistType}
            allTemplates={templates}
            onSave={handleSave} onCancel={() => { setMdQuery(''); setEditing(null); }}
          />
        </div>
      </div>
    );
  }

  if (showFolgas) {
    return (
      <div>
        <div className="p-4 pb-0">
          <BackBar onBack={() => setShowFolgas(false)} label="Gerenciar" accent={unit.color} />
        </div>
        <FolgasView unit={unit} closures={closures} onSaveClosures={onSaveClosures} canSeeAllUnits={canSeeAllUnits} />
      </div>
    );
  }

  // Level 3: list of templates for the selected type + sector
  if (checklistType && sector) {
    const typeConfig = activeTypes.find(c => c.key === checklistType);
    const list = templates
      .filter(t => templateAtiva(t) && t.unitId === unit.id && t.sector === sector && typeConfig.match(t))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

    // Extract praça label same as ExecutarView
    const pracaLabel = t => t.name.includes(' — ') ? t.name.split(' — ')[0] : t.name;

    return (
      <div className="zc-view space-y-3">
        <BackBar onBack={() => setSector(null)} label={`${typeConfig.label} · ${sector}`} accent={unit.color} />
        {saveSuccess && (
          <div className="flex items-center gap-2 px-3 py-2" style={{ background: '#E8F4F0', borderRadius: 8, border: `1px solid ${C.success}` }}>
            <CheckCircle2 size={16} color={C.success} />
            <p style={{ fontSize: 13, fontWeight: W.semibold, color: C.success }}>Checklist salvo com sucesso!</p>
          </div>
        )}
        <div className="space-y-2">
          {list.map(t => (
            <Ticket key={t.id} accent={unit.color}>
              <div className="flex items-center justify-between gap-2">
                <div style={{ minWidth: 0 }}>
                  <p className="font-display" style={{ fontWeight: W.semibold, color: C.ink }}>{pracaLabel(t)}</p>
                  <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                    {t.items.length} itens · {t.items.filter(i => i.critical).length} críticos{t.items.filter(i => i.photoRequired).length > 0 ? ` · ${t.items.filter(i => i.photoRequired).length} com foto` : ''}{t.deadline ? ` · até ${t.deadline}` : ''}
                  </p>
                </div>
                <div className="flex gap-2" style={{ flexShrink: 0 }}>
                  <button onClick={() => setEditing(t)} className="p-2" style={{ borderRadius: 6, border: `1px solid ${C.border}`, background: 'white' }}>
                    <Settings2 size={16} color={C.muted} />
                  </button>
                  <button onClick={() => handleDelete(t.id)} className="p-2" style={{ borderRadius: 6, border: `1px solid ${C.border}`, background: 'white' }}>
                    <Trash2 size={16} color={C.critical} />
                  </button>
                </div>
              </div>
            </Ticket>
          ))}
          {list.length === 0 && (
            <EmptyState title="Sem checklists" desc={`Nenhum checklist de ${typeConfig.label} para ${sector}.`} />
          )}
        </div>
        <button
          onClick={() => setEditing('new')}
          className="flex items-center justify-center gap-2 w-full py-3"
          style={{ borderRadius: 6, border: `2px dashed ${unit.color}`, fontWeight: W.semibold, color: unit.color, background: 'none' }}
        >
          <Plus size={16} /> Novo checklist
        </button>
      </div>
    );
  }

  // Level 2: sectors — grouped same as Executar (Salão then Cozinha for IBR1)
  if (checklistType) {
    const typeConfig = activeTypes.find(c => c.key === checklistType);
    const isIbr1 = unit.id === 'ibr1';
    return (
      <div className="zc-view space-y-3">
        <BackBar onBack={() => setChecklistType(null)} label={typeConfig.label} accent={unit.color} />
        {isIbr1 ? (
          // IBR1: show sectors grouped (Salão / Cozinha) then praças inside
          unit.sectors.map(s => {
            const pracas = templates
              .filter(t => t.unitId === unit.id && t.sector === s && typeConfig.match(t))
              .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
            if (pracas.length === 0) return null;
            return (
              <div key={s}>
                <Eyebrow>{s}</Eyebrow>
                <div className="space-y-2">
                  {pracas.map(t => {
                    const label = t.name.includes(' — ') ? t.name.split(' — ')[0] : t.name;
                    return (
                      <button key={t.id} onClick={() => { setSector(s); setEditing(t); }} className="w-full text-left" style={{ background: 'none', border: 'none', padding: 0 }}>
                        <Ticket accent={unit.color}>
                          <div className="flex items-center justify-between gap-2">
                            <div style={{ minWidth: 0 }}>
                              <p className="font-display" style={{ fontWeight: W.semibold, color: C.ink }}>{label}</p>
                              <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                                {t.items.length} itens · {t.items.filter(i => i.critical).length} críticos{t.deadline ? ` · até ${t.deadline}` : ''}
                              </p>
                            </div>
                            <ChevronRight size={16} color={C.muted} />
                          </div>
                        </Ticket>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })
        ) : (
          // IBR2/3: flat list of sectors
          <div className="space-y-2">
            {unit.sectors.map(s => {
              const count = templates.filter(t => templateAtiva(t) && t.unitId === unit.id && t.sector === s && typeConfig.match(t)).length;
              return (
                <button key={s} onClick={() => setSector(s)} className="w-full text-left" style={{ background: 'none', border: 'none', padding: 0 }}>
                  <Ticket accent={unit.color}>
                    <div className="flex items-center justify-between gap-2">
                      <div style={{ minWidth: 0 }}>
                        <p className="font-display" style={{ fontWeight: W.semibold, color: C.ink }}>{s}</p>
                        <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                          {count} checklist{count !== 1 ? 's' : ''} cadastrado{count !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <ChevronRight size={16} color={C.muted} />
                    </div>
                  </Ticket>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Level 1: tabbed interface
  return (
    <div style={{ paddingBottom: "calc(80px + env(safe-area-inset-bottom, 0px))" }}>
      {/* Tab bar */}
      <div className="flex" style={{ borderBottom: `1px solid ${C.border}`, background: 'white', position: 'sticky', top: 0, zIndex: 10 }}>
        {[
          { id: 'editar', label: 'Checklists' },
          { id: 'novo', label: '+ Novo' },
          { id: 'estrutura', label: 'Estrutura' },
          // Só no celular: lá a barra inferior não cabia Usuários E J.I.T., e o
          // J.I.T. é de uso diário. No desktop o rail tem os dois, então esta
          // sub-aba seria um segundo caminho para o mesmo lugar.
          ...(usersPanel ? [{ id: 'usuarios', label: 'Usuários', mobileOnly: true }] : []),
        ].map(tab => (
          <button key={tab.id} onClick={() => setGerenciarTab(tab.id)}
            className={`flex-1 py-3${tab.mobileOnly ? ' zc-only-mobile' : ''}`}
            style={{ background: 'none', border: 'none', fontWeight: W.semibold, fontSize: 12,
              textTransform: 'uppercase', letterSpacing: '0.06em', cursor: 'pointer',
              color: gerenciarTab === tab.id ? unit.color : C.muted,
              borderBottom: `2px solid ${gerenciarTab === tab.id ? unit.color : 'transparent'}`,
            }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Importar CSV — abre DENTRO do app (usa a sessão atual, sem logoff).
          Ao lado, atalho fixo para subir/trocar o logo da empresa (pedido 18/07). */}
      <div className="flex flex-wrap gap-2" style={{ padding: '10px 16px 0' }}>
        <button onClick={() => setShowImport(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: W.semibold, color: C.ink, border: `1.5px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', background: 'white', cursor: 'pointer' }}>
          <Upload size={14} aria-hidden /> Importar checklists via CSV
        </button>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: W.semibold, color: C.ink, border: `1.5px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', background: 'white', cursor: headerLogoBusy ? 'default' : 'pointer', opacity: headerLogoBusy ? 0.6 : 1 }}>
          <ImageIcon size={14} aria-hidden /> {headerLogoBusy ? 'Enviando…' : (company?.logo_url ? 'Trocar logo' : 'Subir logo')}
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onPickHeaderLogo} disabled={headerLogoBusy} style={{ display: 'none' }} />
        </label>
        {company?.logo_url && !headerLogoBusy && (
          <button onClick={onRemoveHeaderLogo}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: W.semibold, color: C.critical, border: `1.5px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', background: 'white', cursor: 'pointer' }}>
            Remover logo
          </button>
        )}
      </div>
      {showImport && (
        <ImportCsvModal company={company} allUnits={allUnits} templates={templates} activeTypes={activeTypes}
          onSaveSector={onSaveSector}
          onClose={() => setShowImport(false)} onImported={onReloadTemplates} />
      )}

      {/* ── ABA: EDITAR ── */}
      {gerenciarTab === 'editar' && (
        <div className="zc-view space-y-3">
          <Eyebrow>Gerenciar — {unit.name}</Eyebrow>
          <div className="space-y-2">
            {activeTypes.map(({ key, label, match }) => {
              const total = templates.filter(t => templateAtiva(t) && t.unitId === unit.id && match(t)).length;
              return (
                <button key={key} onClick={() => { setChecklistType(key); setSector(null); }} className="w-full text-left" style={{ background: 'none', border: 'none', padding: 0 }}>
                  <Ticket accent={unit.color}>
                    <div className="flex items-center justify-between gap-2">
                      <div style={{ minWidth: 0 }}>
                        <p className="font-display" style={{ fontWeight: W.semibold, color: C.ink }}>{label}</p>
                        <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                          {total} checklist{total !== 1 ? 's' : ''} em {unit.sectors.length} setores
                        </p>
                      </div>
                      <ChevronRight size={16} color={C.muted} />
                    </div>
                  </Ticket>
                </button>
              );
            })}
            <button onClick={() => setShowFolgas(true)} className="w-full text-left" style={{ background: 'none', border: 'none', padding: 0 }}>
              <Ticket accent={C.muted}>
                <div className="flex items-center justify-between gap-2">
                  <div style={{ minWidth: 0 }}>
                    <div className="flex items-center gap-2">
                      <Calendar size={16} color={C.muted} />
                      <p className="font-display" style={{ fontWeight: W.semibold, color: C.ink }}>Folgas e dias fechados</p>
                    </div>
                    <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                      {closures.filter(c => c.unitId === unit.id).length} dia{closures.filter(c => c.unitId === unit.id).length !== 1 ? 's' : ''} marcado{closures.filter(c => c.unitId === unit.id).length !== 1 ? 's' : ''} para {unit.name}
                    </p>
                  </div>
                  <ChevronRight size={16} color={C.muted} />
                </div>
              </Ticket>
            </button>
          </div>
        </div>
      )}

      {/* ── ABA: NOVO ── */}
      {gerenciarTab === 'novo' && novoSuccess && (
        <div className="flex items-center gap-2 px-3 py-2 mx-4 mt-4" style={{ background: '#E8F4F0', borderRadius: R.sm, border: `1px solid ${C.success}` }}>
          <CheckCircle2 size={16} color={C.success} />
          <p style={{ fontSize: T.caption, fontWeight: W.semibold, color: C.success }}>Checklist criado! Ajuste em "Checklists".</p>
        </div>
      )}

      {/* Tela de escolha — três caminhos, hierarquia deliberada */}
      {gerenciarTab === 'novo' && novoMode === null && (
        <div className="zc-view space-y-3">
          <p style={{ fontSize: T.body, fontWeight: W.semibold, color: C.ink }}>Como você quer começar?</p>

          <button onClick={() => setNovoMode('biblioteca')} className="w-full text-left"
            style={{ background: C.ink, color: 'white', borderRadius: R.md, padding: 18, border: 'none', cursor: 'pointer' }}>
            <p style={{ fontSize: T.bodyLg, fontWeight: W.semibold }}>Escolher um modelo pronto</p>
            <p style={{ fontSize: T.caption, opacity: 0.85, marginTop: 4, lineHeight: 1.5 }}>
              Comece de um checklist testado do seu setor e ajuste. O mais rápido.
            </p>
          </button>

          <button onClick={() => { setDupSource(null); setNovoMode('duplicar'); }} className="w-full text-left"
            style={{ background: 'white', borderRadius: R.md, padding: 16, border: `1.5px solid ${C.border}`, cursor: 'pointer' }}>
            <p style={{ fontSize: T.bodySm, fontWeight: W.semibold, color: C.ink }}>Duplicar um checklist existente</p>
            <p style={{ fontSize: T.caption, color: C.muted, marginTop: 2 }}>Copie um que já funciona e adapte para outra loja ou setor.</p>
          </button>

          <button onClick={() => setNovoMode('zero')} className="w-full text-left"
            style={{ background: 'white', borderRadius: R.md, padding: 16, border: `1.5px solid ${C.border}`, cursor: 'pointer' }}>
            <p style={{ fontSize: T.bodySm, fontWeight: W.semibold, color: C.ink }}>Criar do zero</p>
            <p style={{ fontSize: T.caption, color: C.muted, marginTop: 2 }}>Monte item por item, do jeito da sua operação.</p>
          </button>
        </div>
      )}

      {/* Biblioteca setorial */}
      {gerenciarTab === 'novo' && novoMode === 'biblioteca' && !libPreview && (
        <div className="zc-view space-y-4">
          <button onClick={() => setNovoMode(null)} style={{ background: 'none', border: 'none', fontSize: T.caption, fontWeight: W.semibold, color: C.muted, cursor: 'pointer', padding: 0 }}>
            ← Outras formas de criar
          </button>
          <div>
            <Eyebrow>Setor do seu negócio</Eyebrow>
            <div className="flex flex-wrap gap-2 mt-1">
              {LIBRARY_VERTICALS.map(v => (
                <PillButton key={v.id} active={libVertical === v.id} accent={unit.color}
                  onClick={() => setLibVertical(libVertical === v.id ? null : v.id)}>
                  {v.label}
                </PillButton>
              ))}
            </div>
          </div>
          {libVertical && LIBRARY_TEMPLATES.every(t => t.vertical !== libVertical) && (
            <p style={{ fontSize: T.caption, color: C.muted, lineHeight: 1.6 }}>
              Ainda não há modelos prontos para este setor — a biblioteca cresce com a
              demanda. Enquanto isso, crie do zero em &ldquo;Outras formas de criar&rdquo;.
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {LIBRARY_TEMPLATES.filter(t => !libVertical || t.vertical === libVertical).map(t => {
              const crit = t.items.filter(i => i.critical).length;
              return (
                <button key={t.id} onClick={() => { setLibPreview(t); setLibSector(''); }} className="w-full text-left"
                  style={{ background: 'white', borderRadius: R.md, border: `1px solid ${C.border}`, padding: 14, cursor: 'pointer' }}>
                  <p style={{ fontSize: T.bodySm, fontWeight: W.semibold, color: C.ink }}>{t.area} — {t.momento}</p>
                  <p style={{ fontSize: T.label, color: C.muted, marginTop: 2 }}>
                    {LIBRARY_VERTICALS.find(v => v.id === t.vertical)?.label}{t.segmento ? ` · ${t.segmento}` : ''} · {t.items.length} itens{crit ? ` · ${crit} críticos` : ''}
                  </p>
                  <p style={{ fontSize: T.caption, color: C.muted, marginTop: 6, lineHeight: 1.45 }}>{t.descricao}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Preview do modelo — read-only, adoção exige loja + setor */}
      {gerenciarTab === 'novo' && novoMode === 'biblioteca' && libPreview && (
        <div className="zc-view space-y-4">
          <button onClick={() => setLibPreview(null)} style={{ background: 'none', border: 'none', fontSize: T.caption, fontWeight: W.semibold, color: C.muted, cursor: 'pointer', padding: 0 }}>
            ← Modelos
          </button>
          <div>
            <p style={{ fontSize: 'calc(17px * var(--zc-t-scale))', fontWeight: W.semibold, color: C.ink }}>{libPreview.area} — {libPreview.momento}</p>
            <p style={{ fontSize: T.caption, color: C.muted, marginTop: 4 }}>
              Ao adotar, isto vira uma cópia sua — você pode editar tudo depois.
            </p>
          </div>
          <div style={{ background: 'white', borderRadius: R.md, border: `1px solid ${C.border}`, padding: 14 }}>
            {libPreview.items.map((i, idx) => (
              <div key={idx} className="flex items-start gap-2" style={{ padding: '6px 0', borderBottom: idx < libPreview.items.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                <span style={{ fontSize: T.caption, color: C.mutedLight, flexShrink: 0, width: 20 }}>{idx + 1}.</span>
                <p style={{ flex: 1, fontSize: T.bodySm, color: C.ink, lineHeight: 1.45 }}>{i.text}</p>
                <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4, paddingTop: 2 }}>
                  {i.critical && <AlertTriangle size={13} color={C.critical} aria-label="Crítico" />}
                  {i.photoRequired && <Camera size={13} color={C.muted} aria-label="Exige foto" />}
                </span>
              </div>
            ))}
          </div>
          <div>
            <Eyebrow>Adotar para a loja</Eyebrow>
            <div className="flex gap-2 mt-1">
              {unitsForPick.map(u => (
                <button key={u.id} onClick={() => { setLibUnit(u.id); setLibSector(''); }} className="flex-1 py-2"
                  style={{ borderRadius: R.sm, fontWeight: W.semibold, fontSize: T.caption, cursor: 'pointer',
                    background: libUnit === u.id ? u.color : 'white', color: libUnit === u.id ? 'white' : C.ink,
                    border: `1.5px solid ${libUnit === u.id ? u.color : C.border}` }}>
                  {u.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Eyebrow>Setor</Eyebrow>
            <div className="flex flex-wrap gap-2 mt-1">
              {sectorsOf(libUnit).map(s => (
                <PillButton key={s} active={libSector === s} accent={unit.color} onClick={() => setLibSector(s)}>{s}</PillButton>
              ))}
            </div>
          </div>
          <button onClick={handleAdopt} disabled={!libSector} className="w-full"
            style={{ padding: 14, borderRadius: R.md, border: 'none', fontWeight: W.semibold, fontSize: T.body,
              color: 'white', background: libSector ? C.success : C.mutedLight, cursor: libSector ? 'pointer' : 'not-allowed' }}>
            Adotar este modelo
          </button>
        </div>
      )}

      {/* Duplicar de existente */}
      {gerenciarTab === 'novo' && novoMode === 'duplicar' && (
        <div className="zc-view space-y-4">
          <button onClick={() => { setDupSource(null); setNovoMode(null); }} style={{ background: 'none', border: 'none', fontSize: T.caption, fontWeight: W.semibold, color: C.muted, cursor: 'pointer', padding: 0 }}>
            ← Outras formas de criar
          </button>
          {!dupSource ? (
            templates.length === 0 ? (
              <EmptyState title="Nada para duplicar" desc="Sua operação ainda não tem checklists. Comece por um modelo pronto." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Eyebrow>Qual checklist copiar?</Eyebrow>
                {templates.map(t => (
                  <button key={t.id} onClick={() => { setDupSource(t); setDupUnit(t.unitId); setDupSector(''); }} className="w-full text-left"
                    style={{ background: 'white', borderRadius: R.md, border: `1px solid ${C.border}`, padding: 12, cursor: 'pointer' }}>
                    <p style={{ fontSize: T.bodySm, fontWeight: W.semibold, color: C.ink }}>{t.name}</p>
                    <p style={{ fontSize: T.label, color: C.muted, marginTop: 2 }}>
                      {unitsForPick.find(u => u.id === t.unitId)?.name || t.unitId} · {t.sector} · {(t.items || []).length} itens
                    </p>
                  </button>
                ))}
              </div>
            )
          ) : (
            <>
              <p style={{ fontSize: T.bodySm, color: C.ink }}>
                Copiando <strong>{dupSource.name}</strong> ({(dupSource.items || []).length} itens)
              </p>
              <div>
                <Eyebrow>Para a loja</Eyebrow>
                <div className="flex gap-2 mt-1">
                  {unitsForPick.map(u => (
                    <button key={u.id} onClick={() => { setDupUnit(u.id); setDupSector(''); }} className="flex-1 py-2"
                      style={{ borderRadius: R.sm, fontWeight: W.semibold, fontSize: T.caption, cursor: 'pointer',
                        background: dupUnit === u.id ? u.color : 'white', color: dupUnit === u.id ? 'white' : C.ink,
                        border: `1.5px solid ${dupUnit === u.id ? u.color : C.border}` }}>
                      {u.name}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Eyebrow>Setor</Eyebrow>
                <div className="flex flex-wrap gap-2 mt-1">
                  {sectorsOf(dupUnit).map(s => (
                    <PillButton key={s} active={dupSector === s} accent={unit.color} onClick={() => setDupSector(s)}>{s}</PillButton>
                  ))}
                </div>
              </div>
              <button onClick={handleDuplicate} disabled={!dupSector} className="w-full"
                style={{ padding: 14, borderRadius: R.md, border: 'none', fontWeight: W.semibold, fontSize: T.body,
                  color: 'white', background: dupSector ? C.success : C.mutedLight, cursor: dupSector ? 'pointer' : 'not-allowed' }}>
                Criar cópia
              </button>
            </>
          )}
        </div>
      )}

      {gerenciarTab === 'novo' && novoMode === 'zero' && (
        <div className="zc-view space-y-4">
          <button onClick={() => setNovoMode(null)} style={{ background: 'none', border: 'none', fontSize: T.caption, fontWeight: W.semibold, color: C.muted, cursor: 'pointer', padding: 0 }}>
            ← Outras formas de criar
          </button>

          {/* Loja */}
          <div>
            <Eyebrow>Loja</Eyebrow>
            <div className="flex gap-2 mt-1">
              {(allUnits?.length > 0 ? allUnits : UNITS).map(u => (
                <button key={u.id} onClick={() => { setNovoUnit(u.id); setNovoSector(''); }}
                  className="flex-1 py-2"
                  style={{ borderRadius: 8, fontWeight: W.semibold, fontSize: 13, cursor: 'pointer',
                    background: novoUnit === u.id ? u.color : 'white',
                    color: novoUnit === u.id ? 'white' : C.ink,
                    border: `1.5px solid ${novoUnit === u.id ? u.color : C.border}` }}>
                  {u.name}
                </button>
              ))}
            </div>
          </div>

          {/* Setor */}
          <div>
            <Eyebrow>Setor</Eyebrow>
            <div className="flex flex-wrap gap-2 mt-1">
              {novoSectorOptions.map(s => (
                <button key={s} onClick={() => setNovoSector(s)}
                  style={{ borderRadius: 8, fontWeight: W.semibold, fontSize: 12, cursor: 'pointer', padding: '6px 14px',
                    background: novoSector === s ? unit.color : 'white',
                    color: novoSector === s ? 'white' : C.ink,
                    border: `1.5px solid ${novoSector === s ? unit.color : C.border}` }}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Tipo de checklist */}
          <div>
            <Eyebrow>Tipo de checklist</Eyebrow>
            <div className="flex flex-wrap gap-2 mt-1">
              {availableTypes.map(t => (
                <button key={t.id} onClick={() => setNovoType(t.id)}
                  style={{ borderRadius: 8, fontWeight: W.semibold, fontSize: 12, cursor: 'pointer', padding: '6px 14px',
                    background: novoType === t.id ? unit.color : 'white',
                    color: novoType === t.id ? 'white' : C.ink,
                    border: `1.5px solid ${novoType === t.id ? unit.color : C.border}` }}>
                  {t.name}
                </button>
              ))}
              <button onClick={() => setNovoType('__custom__')}
                style={{ borderRadius: 8, fontWeight: W.semibold, fontSize: 12, cursor: 'pointer', padding: '6px 14px',
                  background: novoType === '__custom__' ? C.ink : 'white',
                  color: novoType === '__custom__' ? 'white' : C.muted,
                  border: `1.5px solid ${novoType === '__custom__' ? C.ink : C.border}` }}>
                + Tipo livre
              </button>
            </div>
            {novoType === '__custom__' && (
              <input value={novoCustomType} onChange={e => setNovoCustomType(e.target.value)}
                placeholder="Nome do tipo (ex: Vistoria, Inventário...)"
                className="mt-2 w-full px-3 py-2"
                style={{ fontSize: 13, borderRadius: 8, border: `1.5px solid ${C.border}`, outline: 'none', color: C.ink }} />
            )}
          </div>

          {/* Nome da praça (opcional) */}
          <div>
            <Eyebrow>Nome da praça / subárea (opcional)</Eyebrow>
            <input value={novoName} onChange={e => setNovoName(e.target.value)}
              placeholder="Ex: Bar, Caixa, Recepção... (deixe vazio se não houver)"
              className="mt-1 w-full px-3 py-2"
              style={{ fontSize: 13, borderRadius: 8, border: `1.5px solid ${C.border}`, outline: 'none', color: C.ink }} />
          </div>

          {/* Prazo */}
          <div>
            <Eyebrow>Prazo limite (opcional)</Eyebrow>
            <input type="time" value={novoDeadline} onChange={e => setNovoDeadline(e.target.value)}
              className="mt-1 px-3 py-2"
              style={{ fontSize: 13, borderRadius: 8, border: `1.5px solid ${C.border}`, outline: 'none', color: C.ink }} />
          </div>

          {/* Itens */}
          <div>
            <Eyebrow>Itens do checklist</Eyebrow>
            <div className="space-y-2 mt-1">
              {novoItems.map((item, idx) => {
                const hasGuide = !!(item.description || item.refPhotos?.length || item.refDocs?.length || item.refVideo || item.refLink);
                const guideOpen = !!novoGuidanceOpen[item.id];
                return (
                  <div key={item.id} style={{ background: guideOpen ? 'white' : 'none', border: guideOpen ? `1px solid ${C.border}` : 'none', borderRadius: 10, padding: guideOpen ? 10 : 0 }}>
                    <div className="flex items-center gap-2">
                      <span style={{ fontSize: 11, color: C.muted, fontWeight: W.semibold, width: 20, textAlign: 'right', flexShrink: 0 }}>{idx + 1}</span>
                      <input value={item.text}
                        onChange={e => setNovoItems(prev => prev.map(i => i.id === item.id ? { ...i, text: e.target.value } : i))}
                        placeholder="Descreva a tarefa"
                        className="flex-1 px-3 py-2"
                        style={{ fontSize: 13, borderRadius: 8, border: `1.5px solid ${C.border}`, outline: 'none', color: C.ink, minWidth: 0 }} />
                      <label className="flex items-center gap-1" title="Item crítico"
                        style={{ color: item.critical ? C.critical : C.mutedLight, flexShrink: 0, cursor: 'pointer' }}>
                        <input type="checkbox" aria-label="Item crítico" checked={!!item.critical}
                          onChange={e => setNovoItems(prev => prev.map(i => i.id === item.id ? { ...i, critical: e.target.checked } : i))} />
                        <AlertTriangle size={15} color="currentColor" aria-hidden />
                      </label>
                      {/* Foto e dias são funcionalidades independentes (pedido 18/07):
                          a câmera liga/desliga a exigência direto; o calendário abre só os dias. */}
                      <button onClick={() => setNovoItems(prev => prev.map(i => i.id === item.id ? { ...i, photoRequired: !i.photoRequired } : i))}
                        title="Exigir foto na execução"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }}>
                        <Camera size={15} color={item.photoRequired ? unit.color : C.mutedLight} />
                      </button>
                      <button onClick={() => setNovoOptsOpen(m => ({ ...m, [item.id]: !m[item.id] }))}
                        title="Dias da semana"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }}>
                        <Calendar size={15} color={(item.recurrence && item.recurrence.length) || novoOptsOpen[item.id] ? unit.color : C.mutedLight} />
                      </button>
                      <button onClick={() => setNovoGuidanceOpen(m => ({ ...m, [item.id]: !m[item.id] }))}
                        title="Orientação: instruções, fotos, POP, vídeo"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }}>
                        <FileText size={15} color={hasGuide || guideOpen ? unit.color : C.mutedLight} />
                      </button>
                      <button onClick={() => setNovoItems(prev => prev.filter(i => i.id !== item.id))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }}>
                        <X size={14} color={C.muted} />
                      </button>
                    </div>
                    {item.photoRequired && (
                      <p style={{ marginTop: 4, fontSize: 11, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.06em', color: unit.color, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Camera size={12} aria-hidden /> Exigir foto na execução
                      </p>
                    )}
                    {novoOptsOpen[item.id] && (
                      <div style={{ marginTop: 6, padding: '10px 12px', borderRadius: 8, background: C.bg, border: `1px solid ${C.border}` }}>
                        <p style={{ fontSize: 11, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted, marginBottom: 4 }}>
                          {!item.recurrence || item.recurrence.length === 0 ? 'Todos os dias' : `Apenas: ${item.recurrence.map(d => WEEKDAY_LABELS[d]).join(', ')}`}
                        </p>
                        <div className="flex gap-1">
                          {WEEKDAY_LABELS.map((label, day) => {
                            const rec = item.recurrence || [];
                            const active = rec.includes(day);
                            return (
                              <button key={day}
                                onClick={() => {
                                  const next = active ? rec.filter(d => d !== day) : [...rec, day].sort((a, b) => a - b);
                                  setNovoItems(prev => prev.map(i => i.id === item.id ? { ...i, recurrence: next.length ? next : null } : i));
                                }}
                                style={{ width: 30, height: 26, borderRadius: 4, fontSize: 11, fontWeight: W.semibold, border: `1px solid ${C.border}`, background: active ? unit.color : 'white', color: active ? C.bg : C.muted }}>
                                {label[0]}
                              </button>
                            );
                          })}
                        </div>
                        {/* Mesma regra do editor do checklist existente: ligar
                            carimba a data de ativação, desligar limpa. */}
                        <label className="flex items-center gap-1.5" style={{ marginTop: 8, fontSize: 11, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.06em', color: item.carryover ? unit.color : C.muted }}>
                          <input type="checkbox" checked={!!item.carryover}
                            onChange={e => setNovoItems(prev => prev.map(i => i.id === item.id ? {
                              ...i,
                              carryover: e.target.checked,
                              carryoverSince: e.target.checked ? todayStr(tzOf(unit)) : null,
                            } : i))} />
                          Se não for feita, cobrar no dia seguinte
                        </label>
                      </div>
                    )}
                    {guideOpen && (
                      <ItemGuidanceEditor
                        item={item} accent={unit.color}
                        apply={fn => setNovoItems(prev => prev.map(i => i.id === item.id ? { ...i, ...fn(i) } : i))}
                      />
                    )}
                  </div>
                );
              })}
              <button onClick={() => setNovoItems(prev => [...prev, { id: uid(), text: '', critical: false, required: false, photoRequired: false, recurrence: null, carryover: false }])}
                className="flex items-center gap-2 w-full py-2"
                style={{ borderRadius: 8, border: `2px dashed ${C.border}`, fontWeight: W.semibold, color: C.muted, background: 'none', fontSize: 13 }}>
                <Plus size={14} /> Adicionar item
              </button>
            </div>
          </div>

          {/* O botão nunca é um beco sem saída: enquanto faltar algo, ele mostra
              exatamente o que falta (antes ficava cinza sem explicação). */}
          <button onClick={handleSaveNovo} disabled={novoSaving}
            className="w-full py-3 font-display"
            style={{ borderRadius: 8, border: 'none', fontWeight: W.semibold, color: 'white',
              background: novoMissing.length ? C.muted : unit.color,
              cursor: 'pointer' }}>
            {novoSaving ? 'Criando…' : 'Criar checklist'}
          </button>
          {novoMissing.length > 0 && (
            <p style={{ fontSize: 12, fontWeight: W.semibold, color: C.critical, textAlign: 'center', lineHeight: 1.5, marginTop: -6 }}>
              Para criar, falta: {novoMissing.join(' · ')}.
            </p>
          )}
        </div>
      )}

      {/* ── ABA: ESTRUTURA ── */}
      {gerenciarTab === 'usuarios' && usersPanel && (
        <div className="zc-only-mobile">{usersPanel}</div>
      )}

      {gerenciarTab === 'estrutura' && (
        <EstruturView unit={unit} allUnits={allUnits} checklistTypes={checklistTypes} company={company}
          templates={templates}
          onSaveUnit={onSaveUnit} onSaveSector={onSaveSector} onSaveChecklistType={onSaveChecklistType}
          onDeleteChecklistType={onDeleteChecklistType} onDeleteSector={onDeleteSector}
          onDeleteUnit={onDeleteUnit} onSaveCompany={onSaveCompany} />
      )}
    </div>
  );
}

/* ─────────────────── Estrutura View ─────────────────── */
function EstruturView({ unit, allUnits, checklistTypes, company, templates, onSaveUnit, onSaveSector, onSaveChecklistType, onDeleteChecklistType, onDeleteSector, onDeleteUnit, onSaveCompany }) {
  const [tab, setTab] = useState('tipos'); // 'tipos' | 'lojas' | 'setores'
  const [newTypeName, setNewTypeName] = useState('');
  const [newUnitName, setNewUnitName] = useState('');
  const [newUnitColor, setNewUnitColor] = useState('#063C5C');
  const [editUnit, setEditUnit] = useState(null); // { id, name, color } em edição
  const [editType, setEditType] = useState(null);   // { id, name }
  const [editSector, setEditSector] = useState(null); // { id, name, unitId }
  // Setores vêm das LINHAS reais (com id), não dos nomes em `unit.sectors`:
  // sem id não há o que editar nem o que apagar.
  const sectorRows = useSectors();
  const [logoBusy, setLogoBusy] = useState(false);

  const saveEditUnit = async () => {
    if (!editUnit?.name.trim()) return;
    setSaving(true);
    try {
      await onSaveUnit?.({
        id: editUnit.id, companyId: company?.id, name: editUnit.name.trim(),
        color: editUnit.color, timezone: editUnit.timezone || APP_TZ,
      });
      flash('Loja atualizada!'); setEditUnit(null);
    }
    catch (e) { flashErro('Não foi possível atualizar a loja', e); } finally { setSaving(false); }
  };
  /** Quantos checklists usam este tipo/setor — o número entra no aviso, para a
   *  confirmação dizer o tamanho do estrago em vez de um "tem certeza?" vazio. */
  const usoDoTipo = (t) => (templates || []).filter(x => (x.checklistType || x.type) === t.id || x.typeName === t.name).length;
  const usoDoSetor = (sec) => (templates || []).filter(x => x.unitId === (sec.unit_id || sec.unitId) && x.sector === sec.name).length;

  const saveEditType = async () => {
    const nome = editType?.name.trim();
    if (!nome) return;
    setSaving(true);
    try { await onSaveChecklistType?.({ id: editType.id, companyId: company?.id, name: nome, shift: editType.shift ?? null }); flash('Tipo atualizado!'); setEditType(null); }
    catch (e) { flashErro('Não foi possível atualizar o tipo', e); } finally { setSaving(false); }
  };
  const removeType = async (t) => {
    const uso = usoDoTipo(t);
    const aviso = uso
      ? `Remover o tipo "${t.name}"? ${uso === 1
          ? '1 checklist usa este tipo e deixará de aparecer agrupado por ele.'
          : `${uso} checklists usam este tipo e deixarão de aparecer agrupados por ele.`}`
      : `Remover o tipo "${t.name}"?`;
    if (!confirm(aviso)) return;
    try { await onDeleteChecklistType?.(t.id); flash('Tipo removido.'); } catch (e) { flashErro('Não foi possível remover o tipo', e); }
  };

  const saveEditSector = async () => {
    const nome = editSector?.name.trim();
    if (!nome) return;
    setSaving(true);
    try { await onSaveSector?.({ id: editSector.id, companyId: company?.id, unitId: editSector.unitId, name: nome }); flash('Setor atualizado!'); setEditSector(null); }
    catch (e) { flashErro('Não foi possível atualizar o setor', e); } finally { setSaving(false); }
  };
  const removeSector = async (sec) => {
    const uso = usoDoSetor(sec);
    // Frase montada com palavras inteiras, não sufixos colados: concatenar
    // "está" + "ão" produzia "estáão".
    const aviso = uso
      ? `Remover o setor "${sec.name}"? ${uso === 1
          ? '1 checklist está nele e ficará sem setor.'
          : `${uso} checklists estão nele e ficarão sem setor.`}`
      : `Remover o setor "${sec.name}"?`;
    if (!confirm(aviso)) return;
    try { await onDeleteSector?.(sec); flash('Setor removido.'); } catch (e) { flashErro('Não foi possível remover o setor', e); }
  };

  const removeUnit = async (u) => {
    if (!confirm(`Remover a loja "${u.name}"? Os checklists dela deixam de aparecer.`)) return;
    try { await onDeleteUnit?.(u.id); flash('Loja removida.'); } catch (e) { flashErro('Não foi possível remover a loja', e); }
  };
  const onPickCompanyLogo = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    setLogoBusy(true);
    try {
      const m = await import('../../lib/sync');
      const url = await m.uploadCompanyLogo(company.id, f);
      await onSaveCompany?.({ logoUrl: url });
      flash('Logo atualizado!');
    } catch (err) { console.error(err); alert('Não foi possível subir o logo. Tente uma imagem PNG/JPG menor.'); }
    finally { setLogoBusy(false); }
  };
  const removeCompanyLogo = async () => {
    if (!confirm('Remover o logo da empresa?')) return;
    setLogoBusy(true);
    try { await onSaveCompany?.({ logoUrl: null }); flash('Logo removido.'); }
    catch (e) { console.error(e); } finally { setLogoBusy(false); }
  };
  const [newSectorName, setNewSectorName] = useState('');
  const [newSectorUnit, setNewSectorUnit] = useState(unit.id);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [failure, setFailure] = useState('');

  // Além do bloco inline (que some do viewport quando a página está rolada),
  // dispara o toast fixo global — pedido do reteste de 18/07.
  const flash = msg => { setFailure(''); setSuccess(msg); setTimeout(() => setSuccess(''), 2500); showToast(msg); };
  // Falha aqui ia só para o console: a pessoa clicava "Criar", nada acontecia e
  // ela seguia achando que a loja existia. Agora o erro fica na tela até o
  // próximo sucesso, com o motivo que o banco devolveu.
  const flashErro = (acao, e) => {
    console.error(acao, e);
    setSuccess('');
    setFailure(`${acao}${e?.message ? `: ${e.message}` : '. Tente de novo.'}`);
  };

  const addType = async () => {
    if (!newTypeName.trim()) return;
    setSaving(true);
    const t = { id: uid(), companyId: company?.id || 'ibr', name: newTypeName.trim(), sortOrder: (checklistTypes?.length || 0) + 1 };
    try { await onSaveChecklistType?.(t); flash('Tipo criado!'); setNewTypeName(''); }
    catch(e) { flashErro('Não foi possível criar o tipo', e); }
    setSaving(false);
  };

  const addUnit = async () => {
    if (!newUnitName.trim()) return;
    setSaving(true);
    const u = { id: uid(), companyId: company?.id || 'ibr', name: newUnitName.trim(), color: newUnitColor, sortOrder: (allUnits?.length || 0) + 1 };
    try { await onSaveUnit?.(u); flash('Loja criada!'); setNewUnitName(''); }
    catch(e) { flashErro('Não foi possível criar a loja', e); }
    setSaving(false);
  };

  const addSector = async () => {
    if (!newSectorName.trim()) return;
    setSaving(true);
    const s = { id: uid(), companyId: company?.id || 'ibr', unitId: newSectorUnit, name: newSectorName.trim() };
    try { await onSaveSector?.(s); flash('Setor criado!'); setNewSectorName(''); }
    catch(e) { flashErro('Não foi possível criar o setor', e); }
    setSaving(false);
  };

  return (
    <div className="zc-view space-y-4">
      {success && (
        <div className="flex items-center gap-2 px-3 py-2" style={{ background: '#E8F4F0', borderRadius: 8, border: `1px solid ${C.success}` }}>
          <CheckCircle2 size={16} color={C.success} />
          <p style={{ fontSize: 13, fontWeight: W.semibold, color: C.success }}>{success}</p>
        </div>
      )}
      {failure && (
        <div className="flex items-start gap-2 px-3 py-2" role="alert" style={{ background: '#FDEDED', borderRadius: 8, border: `1px solid ${C.critical}` }}>
          <AlertTriangle size={16} color={C.critical} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden />
          <p style={{ fontSize: 13, fontWeight: W.semibold, color: C.critical }}>{failure}</p>
        </div>
      )}

      <div className="flex gap-2">
        {[{id:'tipos',label:'Tipos'},{id:'lojas',label:'Lojas'},{id:'setores',label:'Setores'}].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ flex: 1, padding: '8px 4px', borderRadius: 8, fontWeight: W.semibold, fontSize: 12,
              background: tab === t.id ? unit.color : 'white', color: tab === t.id ? 'white' : C.muted,
              border: `1.5px solid ${tab === t.id ? unit.color : C.border}`, cursor: 'pointer' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tipos de checklist */}
      {tab === 'tipos' && (
        <div className="space-y-3">
          <Eyebrow>Tipos de checklist</Eyebrow>
          {(checklistTypes || []).length === 0 && (
            <p style={{ fontSize: T.caption, color: C.mutedLight }}>Nenhum tipo próprio ainda — os padrões (Abertura, Intermediário, Fechamento) seguem valendo.</p>
          )}
          {(checklistTypes || []).map(t => (
            <Ticket key={t.id} accent={unit.color}>
              {editType?.id === t.id ? (
                <div className="flex items-center gap-2">
                  <input value={editType.name} autoFocus
                    onChange={e => setEditType({ ...editType, name: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Enter') saveEditType(); if (e.key === 'Escape') setEditType(null); }}
                    className="flex-1 px-2 py-1"
                    style={{ fontSize: T.bodySm, borderRadius: R.sm, border: `1.5px solid ${C.borderStrong}`, color: C.ink }} />
                  <button onClick={saveEditType} disabled={saving || !editType.name.trim()}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.success, fontWeight: W.semibold, fontSize: T.caption, flexShrink: 0 }}>Salvar</button>
                  <button onClick={() => setEditType(null)} aria-label="Cancelar edição"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, flexShrink: 0 }}><X size={16} /></button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: W.semibold, color: C.ink }}>{t.name}</p>
                    {t.shift && <p style={{ fontSize: 11, color: C.muted }}>{t.shift}</p>}
                  </div>
                  <button onClick={() => setEditType({ id: t.id, name: t.name, shift: t.shift })} aria-label={`Editar ${t.name}`} title="Editar"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, flexShrink: 0, display: 'grid', placeItems: 'center', width: 32, height: 32, borderRadius: 8, }}><Settings2 size={16} /></button>
                  <button onClick={() => removeType(t)} aria-label={`Remover ${t.name}`} title="Remover"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.critical, flexShrink: 0, display: 'grid', placeItems: 'center', width: 32, height: 32, borderRadius: 8, }}><Trash2 size={15} /></button>
                </div>
              )}
            </Ticket>
          ))}
          <div className="flex gap-2">
            <input value={newTypeName} onChange={e => setNewTypeName(e.target.value)}
              placeholder="Novo tipo (ex: Vistoria, Inventário...)"
              className="flex-1 px-3 py-2"
              style={{ fontSize: 13, borderRadius: 8, border: `1.5px solid ${C.border}`, outline: 'none' }}
              onKeyDown={e => e.key === 'Enter' && addType()} />
            <button onClick={addType} disabled={saving || !newTypeName.trim()}
              style={{ padding: '8px 16px', borderRadius: 8, background: unit.color, color: 'white', border: 'none', fontWeight: W.semibold, cursor: 'pointer' }}>
              <Plus size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Lojas */}
      {tab === 'lojas' && (
        <div className="space-y-3">
          {/* Logo da empresa — subir/trocar/remover aqui (além do onboarding). */}
          <Eyebrow>Logo da empresa</Eyebrow>
          <div className="flex items-center gap-3" style={{ marginBottom: 4 }}>
            <div style={{ width: 56, height: 56, borderRadius: 10, border: `1.5px solid ${C.border}`, background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
              {company?.logo_url ? <img src={company.logo_url} alt="logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} /> : <span style={{ fontSize: 10, color: C.muted }}>sem logo</span>}
            </div>
            <label style={{ padding: '9px 14px', borderRadius: 8, border: `1.5px solid ${C.border}`, background: 'white', color: C.ink, fontWeight: W.semibold, fontSize: 13, cursor: logoBusy ? 'default' : 'pointer', opacity: logoBusy ? 0.6 : 1 }}>
              {logoBusy ? '...' : (company?.logo_url ? 'Trocar' : 'Subir logo')}
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onPickCompanyLogo} disabled={logoBusy} style={{ display: 'none' }} />
            </label>
            {company?.logo_url && !logoBusy && (
              <button onClick={removeCompanyLogo} style={{ background: 'none', border: 'none', color: C.critical, fontWeight: W.semibold, fontSize: 13, cursor: 'pointer' }}>Remover</button>
            )}
          </div>

          <Eyebrow>Lojas</Eyebrow>
          {(allUnits || UNITS).map(u => (
            <Ticket key={u.id} accent={u.color}>
              {editUnit?.id === u.id ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input type="color" value={editUnit.color} onChange={e => setEditUnit(p => ({ ...p, color: e.target.value }))}
                      style={{ width: 36, height: 36, borderRadius: 8, border: `1.5px solid ${C.border}`, cursor: 'pointer', padding: 2, flexShrink: 0 }} />
                    <input value={editUnit.name} onChange={e => setEditUnit(p => ({ ...p, name: e.target.value }))}
                      className="flex-1 px-2 py-2" style={{ fontSize: 13, borderRadius: 8, border: `1.5px solid ${C.border}`, outline: 'none', minWidth: 0 }} />
                    <button onClick={saveEditUnit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.success, fontWeight: W.semibold, fontSize: 13, flexShrink: 0 }}>Salvar</button>
                    <button onClick={() => setEditUnit(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, flexShrink: 0 }}><X size={16} /></button>
                  </div>
                  {/* Fuso em linha própria: no celular ele não cabe ao lado do
                      nome, e é a configuração que mais precisa ser lida com
                      calma — trocar errado desloca o dia da loja inteira. */}
                  <label className="block">
                    <span style={{ fontSize: 11, fontWeight: W.semibold, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      Fuso horário
                    </span>
                    <select
                      value={editUnit.timezone || APP_TZ}
                      onChange={e => setEditUnit(p => ({ ...p, timezone: e.target.value }))}
                      className="w-full px-2 py-2 mt-1"
                      style={{ fontSize: 13, fontWeight: W.semibold, color: C.ink, background: 'white', borderRadius: 8, border: `1.5px solid ${C.border}`, outline: 'none' }}
                    >
                      {/* Fuso gravado fora da lista (importação, ajuste direto no
                          banco) continua selecionável em vez de virar campo em
                          branco que se perde no primeiro "Salvar". */}
                      {!TIMEZONES.some(t => t.id === (editUnit.timezone || APP_TZ)) && (
                        <option value={editUnit.timezone}>{editUnit.timezone}</option>
                      )}
                      {TIMEZONES.map(t => (
                        <option key={t.id} value={t.id}>{t.label} — {t.hint}</option>
                      ))}
                    </select>
                    <span style={{ fontSize: 11, color: C.muted, display: 'block', marginTop: 4 }}>
                      Define o dia de operação e a hora dos prazos desta loja.
                      Agora são {new Date().toLocaleTimeString('pt-BR', { timeZone: editUnit.timezone || APP_TZ, hour: '2-digit', minute: '2-digit' })} lá.
                    </span>
                  </label>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: u.color, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: W.semibold, color: C.ink }}>{u.name}</p>
                    {/* Só aparece quando a loja NÃO está em Brasília: para o
                        parque inteiro isto seria uma linha repetida sem
                        informação, e o que importa é destacar a exceção. */}
                    {tzOf(u) !== APP_TZ && (
                      <p style={{ fontSize: 11, color: C.muted }}>
                        {TIMEZONES.find(t => t.id === tzOf(u))?.label || tzOf(u)}
                      </p>
                    )}
                  </div>
                  <button onClick={() => setEditUnit({ id: u.id, name: u.name, color: u.color, timezone: tzOf(u) })} title="Editar"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, flexShrink: 0 }}><Settings2 size={16} /></button>
                  {(allUnits || UNITS).length > 1 && (
                    <button onClick={() => removeUnit(u)} title="Remover"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.critical, flexShrink: 0 }}><Trash2 size={15} /></button>
                  )}
                </div>
              )}
            </Ticket>
          ))}
          <div className="flex gap-2">
            <input value={newUnitName} onChange={e => setNewUnitName(e.target.value)}
              placeholder="Nome da loja"
              className="flex-1 px-3 py-2"
              style={{ fontSize: 13, borderRadius: 8, border: `1.5px solid ${C.border}`, outline: 'none' }}
              onKeyDown={e => e.key === 'Enter' && addUnit()} />
            <input type="color" value={newUnitColor} onChange={e => setNewUnitColor(e.target.value)}
              style={{ width: 42, height: 42, borderRadius: 8, border: `1.5px solid ${C.border}`, cursor: 'pointer', padding: 2 }} />
            <button onClick={addUnit} disabled={saving || !newUnitName.trim()}
              style={{ padding: '8px 16px', borderRadius: 8, background: unit.color, color: 'white', border: 'none', fontWeight: W.semibold, cursor: 'pointer' }}>
              <Plus size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Setores */}
      {tab === 'setores' && (
        <div className="space-y-3">
          <Eyebrow>Setores por loja</Eyebrow>
          {(allUnits || UNITS).map(u => {
            const linhas = sectorRows.filter(sr => (sr.unit_id || sr.unitId) === u.id);
            // Empresa antiga pode ter setor só como nome, sem linha no banco:
            // ali não há id, então mostra sem controles em vez de mentir que dá
            // para editar.
            const legados = linhas.length ? [] : (u.sectors || []);
            return (
              <div key={u.id}>
                <p style={{ fontSize: 11, fontWeight: W.semibold, color: u.color, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{u.name}</p>
                <div className="space-y-1">
                  {linhas.length === 0 && legados.length === 0 && (
                    <p style={{ fontSize: T.caption, color: C.mutedLight }}>Nenhum setor nesta loja.</p>
                  )}
                  {linhas.map(sr => (
                    <div key={sr.id} className="px-3 py-2 flex items-center gap-2"
                      style={{ background: 'white', borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 13, color: C.ink }}>
                      {editSector?.id === sr.id ? (
                        <>
                          <input value={editSector.name} autoFocus
                            onChange={e => setEditSector({ ...editSector, name: e.target.value })}
                            onKeyDown={e => { if (e.key === 'Enter') saveEditSector(); if (e.key === 'Escape') setEditSector(null); }}
                            className="flex-1 px-2 py-1"
                            style={{ fontSize: T.bodySm, borderRadius: R.sm, border: `1.5px solid ${C.borderStrong}`, color: C.ink }} />
                          <button onClick={saveEditSector} disabled={saving || !editSector.name.trim()}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.success, fontWeight: W.semibold, fontSize: T.caption, flexShrink: 0 }}>Salvar</button>
                          <button onClick={() => setEditSector(null)} aria-label="Cancelar edição"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, flexShrink: 0 }}><X size={16} /></button>
                        </>
                      ) : (
                        <>
                          <span style={{ flex: 1, minWidth: 0 }}>{sr.name}</span>
                          <button onClick={() => setEditSector({ id: sr.id, name: sr.name, unitId: u.id })} aria-label={`Editar ${sr.name}`} title="Editar"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, flexShrink: 0, display: 'grid', placeItems: 'center', width: 32, height: 32, borderRadius: 8, }}><Settings2 size={15} /></button>
                          <button onClick={() => removeSector({ ...sr, unitId: u.id })} aria-label={`Remover ${sr.name}`} title="Remover"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.critical, flexShrink: 0, display: 'grid', placeItems: 'center', width: 32, height: 32, borderRadius: 8, }}><Trash2 size={14} /></button>
                        </>
                      )}
                    </div>
                  ))}
                  {legados.map(nome => (
                    <div key={nome} className="px-3 py-2" style={{ background: C.bg, borderRadius: 6, border: `1px dashed ${C.border}`, fontSize: 13, color: C.muted }}>
                      {nome} <span style={{ fontSize: T.label }}>· setor antigo, sem registro editável</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          <div className="flex gap-2 mt-2">
            <select value={newSectorUnit} onChange={e => setNewSectorUnit(e.target.value)}
              style={{ fontSize: 13, borderRadius: 8, border: `1.5px solid ${C.border}`, padding: '8px 10px', outline: 'none', color: C.ink }}>
              {(allUnits || UNITS).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <input value={newSectorName} onChange={e => setNewSectorName(e.target.value)}
              placeholder="Nome do setor"
              className="flex-1 px-3 py-2"
              style={{ fontSize: 13, borderRadius: 8, border: `1.5px solid ${C.border}`, outline: 'none' }}
              onKeyDown={e => e.key === 'Enter' && addSector()} />
            <button onClick={addSector} disabled={saving || !newSectorName.trim()}
              style={{ padding: '8px 16px', borderRadius: 8, background: unit.color, color: 'white', border: 'none', fontWeight: W.semibold, cursor: 'pointer' }}>
              <Plus size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------- user editor -------------------------------- */

function UserEditor({ user, onSave, onCancel }) {
  const units = useUnits(); // lojas da empresa logada (antes: constante do IBR)
  const [name, setName] = useState(user?.name || '');
  const [pin, setPin] = useState(user?.pin || '');
  const [role, setRole] = useState(user?.role || 'colaborador');
  const [unitId, setUnitId] = useState(user?.unitId ?? (units[0].id));
  const [sectorId, setSectorId] = useState(user?.sectorId ?? null);
  const [suspended, setSuspended] = useState(!!user?.suspended);
  const [error, setError] = useState('');

  const needsUnit = role === 'colaborador' || role === 'lideranca' || role === 'gerencia';
  const unitObj = units.find(u => u.id === unitId);
  // Seletor de setor: IBR1 mantém os grupos legados; as demais empresas listam
  // as linhas da tabela `sectors` da loja escolhida (antes o picker era IBR1-only
  // e o vínculo de setor ficava inacessível fora da aprovação de cadastro).
  const sectorRows = useSectors();
  const canPickSector = needsUnit && (role === 'colaborador' || role === 'lideranca');
  const sectorGroups = !canPickSector ? [] : unitId === 'ibr1'
    ? [
        { id: null, label: 'Todos os setores', desc: 'Vê checklists de toda a loja' },
        { id: 'salao', label: 'Salão', desc: 'Salão interno, Jardim, Bar e Caixa' },
        { id: 'cozinha', label: 'Cozinha', desc: 'Brunch, Produção, Pizza e Bowls' },
      ]
    : [
        { id: null, label: 'Todos os setores', desc: 'Vê checklists de toda a loja' },
        ...sectorRows
          .filter(s => (s.unit_id || s.unitId) === unitId)
          .map(s => ({ id: s.id, label: s.name, desc: `Vê apenas os checklists de ${s.name}` })),
      ];
  const showSectorPicker = sectorGroups.length > 1;

  const save = () => {
    if (!name.trim()) { setError('Informe o nome.'); return; }
    if (!user?.id && !/^\d{4}$/.test(pin)) { setError('O PIN deve ter exatamente 4 dígitos.'); return; }
    if (pin && !/^\d{4}$/.test(pin)) { setError('O PIN deve ter exatamente 4 dígitos.'); return; }
    onSave({
      id: user?.id, name: name.trim(),
      pin: pin || undefined,
      role, unitId: needsUnit ? unitId : null,
      sectorId: showSectorPicker ? sectorId : null,
      suspended,
    });
  };

  return (
    <div className="zc-view" style={{ paddingBottom: "calc(160px + env(safe-area-inset-bottom, 0px))" }}>
      <BackBar onBack={onCancel} label="Usuários" accent={C.ink} />

      <div className="mb-3">
        <Ticket accent={suspended ? C.critical : ROLE_COLORS[role]}>
          <Eyebrow>Nome</Eyebrow>
          <input
            value={name} onChange={e => setName(e.target.value)} placeholder="Nome do usuário"
            className="w-full mt-1 mb-3"
            style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 14, fontWeight: W.semibold, color: C.ink }}
          />
          <Eyebrow>PIN de acesso (4 dígitos){user?.id ? ' — deixe em branco para manter o atual' : ''}</Eyebrow>
          <input
            type="tel" inputMode="numeric" maxLength={4}
            value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder={user?.id ? '(manter atual)' : '0000'}
            className="mt-1"
            style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 14, fontWeight: W.semibold, letterSpacing: '0.3em', color: C.ink }}
          />
        </Ticket>
      </div>

      <Eyebrow>Nível de acesso</Eyebrow>
      <div className="space-y-2 mt-2 mb-3">
        {ROLES.map(r => (
          <button key={r} onClick={() => setRole(r)} className="w-full text-left" style={{ background: 'none', border: 'none', padding: 0 }}>
            <Ticket accent={r === role ? ROLE_COLORS[r] : C.border}>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-display" style={{ fontWeight: W.semibold, color: r === role ? ROLE_COLORS[r] : C.ink }}>{ROLE_LABELS[r]}</p>
                  <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{ROLE_DESCRIPTIONS[r]}</p>
                </div>
                {r === role
                  ? <CheckCircle2 size={20} color={ROLE_COLORS[r]} />
                  : <Circle size={20} color={C.mutedLight} />}
              </div>
            </Ticket>
          </button>
        ))}
      </div>

      {needsUnit && (
        <>
          <Eyebrow>Loja vinculada</Eyebrow>
          <div className="flex gap-2 mt-2 mb-3">
            {units.map(u => (
              <PillButton key={u.id} active={u.id === unitId} accent={u.color}
                onClick={() => { setUnitId(u.id); setSectorId(null); }}>{u.name}</PillButton>
            ))}
          </div>
        </>
      )}

      {showSectorPicker && (
        <>
          <Eyebrow>Setor</Eyebrow>
          <div className="space-y-2 mt-2 mb-3">
            {sectorGroups.map(sg => (
              <button key={String(sg.id)} onClick={() => setSectorId(sg.id)} className="w-full text-left" style={{ background: 'none', border: 'none', padding: 0 }}>
                <Ticket accent={sectorId === sg.id ? unitObj?.color : C.border}>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-display" style={{ fontWeight: W.semibold, color: sectorId === sg.id ? unitObj?.color : C.ink }}>{sg.label}</p>
                      <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{sg.desc}</p>
                    </div>
                    {sectorId === sg.id
                      ? <CheckCircle2 size={20} color={unitObj?.color} />
                      : <Circle size={20} color={C.mutedLight} />}
                  </div>
                </Ticket>
              </button>
            ))}
          </div>
        </>
      )}

      {!needsUnit && (
        <p style={{ fontSize: 12, color: C.muted }}>Este nível tem acesso a todas as lojas.</p>
      )}

      {/* Suspensão de acesso — só para usuários existentes e não-gestão */}
      {user?.id && user?.role !== 'gestao' && (
        <div style={{ marginTop: 16 }}>
          <Eyebrow>Acesso</Eyebrow>
          <button
            onClick={() => setSuspended(v => !v)}
            style={{
              width: '100%', marginTop: 8, padding: '12px 16px',
              borderRadius: 10, cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'space-between',
              background: suspended ? '#FFF3F0' : '#F0FAF4',
              border: `1.5px solid ${suspended ? C.critical : C.success}`,
            }}
          >
            <div style={{ textAlign: 'left' }}>
              <p style={{ fontSize: 13, fontWeight: W.semibold, color: suspended ? C.critical : C.success, display: 'flex', alignItems: 'center', gap: 5 }}>
                {suspended
                  ? <><Lock size={13} aria-hidden /> Acesso suspenso</>
                  : <><CheckCircle2 size={13} aria-hidden /> Acesso ativo</>}
              </p>
              <p style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                {suspended
                  ? 'Usuário não consegue fazer login. Toque para reativar.'
                  : 'Toque para suspender temporariamente o acesso.'}
              </p>
            </div>
            <div style={{
              width: 44, height: 24, borderRadius: 999,
              background: suspended ? C.critical : C.success,
              position: 'relative', flexShrink: 0, transition: 'background 0.2s',
            }}>
              <div style={{
                position: 'absolute', top: 2,
                left: suspended ? 2 : 22,
                width: 20, height: 20, borderRadius: '50%',
                background: 'white', transition: 'left 0.2s',
              }} />
            </div>
          </button>
        </div>
      )}

      {error && <p style={{ fontSize: 12, fontWeight: W.semibold, color: C.critical, marginTop: 12 }}>{error}</p>}

      <div className="zc-actionbar fixed left-0 right-0 p-3 flex gap-2" style={{ bottom: "calc(var(--zc-nav-h) + env(safe-area-inset-bottom, 0px))", background: 'rgba(250,246,239,0.96)', borderTop: `1px solid ${C.border}`, zIndex: 90 }}>
        <button onClick={onCancel} className="flex-1 py-3" style={{ borderRadius: 6, border: `1px solid ${C.border}`, fontWeight: W.semibold, color: C.ink, background: 'white' }}>
          Cancelar
        </button>
        <button onClick={save} className="font-display flex-1 py-3" style={{ borderRadius: 6, border: 'none', fontWeight: W.semibold, color: C.bg, background: suspended ? C.critical : C.ink }}>
          Salvar usuário
        </button>
      </div>
    </div>
  );
}

function CopyLinkButton({ url }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };
  return (
    <button onClick={copy} style={{
      background: copied ? C.success : C.ink,
      color: 'white', border: 'none', borderRadius: 6,
      padding: '6px 12px', fontSize: 12, fontWeight: W.semibold,
      cursor: 'pointer', flexShrink: 0,
      transition: 'background 0.2s',
      minWidth: 70,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
    }}>
      {copied ? <><Check size={13} aria-hidden /> Copiado!</> : 'Copiar'}
    </button>
  );
}

function SelfieViewer({ path }) {
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!path) return;
    import('../../lib/supabase').then(async ({ supabase }) => {
      // O bucket 'colaboradores' é privado: selfie + CPF. Nunca usar getPublicUrl aqui.
      const { data } = await supabase.storage
        .from('colaboradores')
        .createSignedUrl(path, 3600);
      if (data?.signedUrl) setUrl(data.signedUrl);
      else setError(true);
    });
  }, [path]);
  if (error) return <p style={{ fontSize: 12, color: C.muted }}>Selfie não disponível.</p>;
  if (!url) return <p style={{ fontSize: 12, color: C.muted }}>Carregando selfie…</p>;
  return (
    <div style={{ borderRadius: 10, overflow: 'hidden', border: `1px solid ${C.border}`, maxWidth: 220 }}>
      <img src={url} alt="Selfie" style={{ width: '100%', display: 'block' }}
        onError={() => setError(true)} />
    </div>
  );
}

export function UsersView({ users, onSaveUsers, currentUser, onGenerateTestData, generatingTestData, testDataResult }) {
  const units = useUnits(); // unidades da empresa logada (antes: constante do IBR)
  const [onlineUsers, setOnlineUsers] = useState(new Set());

  useEffect(() => {
    let channel;
    const setup = async () => {
      const { supabase } = await import('../../lib/supabase');
      channel = supabase.channel('presence:users', { config: { presence: { key: currentUser?.id || 'anon' } } });
      channel
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState();
          const ids = new Set(Object.keys(state));
          setOnlineUsers(ids);
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await channel.track({ user_id: currentUser?.id, online_at: new Date().toISOString() });
          }
        });
    };
    setup();
    return () => { if (channel) channel.unsubscribe(); };
  }, [currentUser?.id]);
  /**
   * Quem está sem notificação ativa.
   *
   * `undefined` = carregando · `null` = não deu para saber (a tela não acusa
   * ninguém) · Map = userId → última inscrição. A distinção existe porque marcar
   * a equipe inteira como "sem notificação" por causa de uma falha de leitura
   * mandaria a gestão cobrar gente que está com tudo certo.
   *
   * Só o alvo do push importa aqui: é a inscrição do APARELHO, não a permissão
   * do navegador. Uma pessoa pode ter concedido a permissão e não ter inscrição
   * (endpoint podado por 404/410, PWA reinstalado) — e é justamente esse caso
   * que não aparecia em lugar nenhum.
   */
  const [pushPorUsuario, setPushPorUsuario] = useState(undefined);
  useEffect(() => { fetchPushStatus().then(setPushPorUsuario); }, []);
  const semPush = u => pushPorUsuario instanceof Map && !pushPorUsuario.has(u.id);

  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [requests, setRequests] = useState([]);
  const [reviewingRequest, setReviewingRequest] = useState(null);
  const [editingReq, setEditingReq] = useState({});
  const [approvalRole, setApprovalRole] = useState('colaborador');
  const [approvalUnit, setApprovalUnit] = useState(null);   // string — colaborador/liderança
  const [approvalUnits, setApprovalUnits] = useState([]); // array — gerência multi-select
  const [approvalSector, setApprovalSector] = useState(null);
  const [processingId, setProcessingId] = useState(null);
  const sectorRows = useSectors(); // setores reais da empresa, para a aprovação

  const gestaoCount = users.filter(u => u.role === 'gestao').length;

  // Load pending requests — only for gestao
  useEffect(() => {
    if (currentUser?.role !== 'gestao') return;
    const load = async () => {
      try {
        const supabase = (await import('../../lib/supabase')).authedSupabase();
        // Nunca selecionar `pin`: a anon key está no bundle e o PIN é sensível.
        // O anon não tem mais SELECT nessa coluna (ver migração
        // 20260709_secure_user_requests.sql); na aprovação o PIN é copiado
        // server-side pela RPC create_user_from_request.
        const { data, error } = await supabase
          .from('user_requests')
          .select('id, name, cpf, phone, email, unit_id, selfie_path, status, note, role, sector_id, created_at, reviewed_at, reviewed_by')
          .eq('status', 'pendente')
          .order('created_at', { ascending: true });
        if (error) console.warn('Requests load error:', error);
        setRequests(data || []);
      } catch (e) { console.warn('Could not load requests', e); }
    };
    load();
  }, [currentUser?.role]);

  const approveRequest = async (req) => {
    setProcessingId(req.id);
    try {
      const supabase = (await import('../../lib/supabase')).authedSupabase();
      const isAlteracao = req.note?.startsWith('[ALTERAÇÃO DE DADOS]');

      // Merge edits into the request. `req.pin` não existe mais no cliente (o
      // anon não pode ler a coluna); `finalPin` só tem valor se a gestão digitou
      // um PIN novo no modal — nesse caso ele sobrescreve o PIN da solicitação.
      const finalName = editingReq.name ?? req.name;
      const finalPin  = editingReq.pin || '';
      const finalNote = editingReq.note !== undefined ? `[ALTERAÇÃO DE DADOS] ${editingReq.note}` : req.note;

      if (!isAlteracao) {
        // Create new user
        const finalUnitId = approvalRole === 'gerencia'
          ? (approvalUnits.length === 0 ? null : approvalUnits.length === 1 ? approvalUnits[0] : approvalUnits.join(','))
          : (approvalUnit || req.unit_id);

        // Sem `pin` no objeto do cliente — o PIN nunca volta ao bundle.
        const newUser = {
          id: uid(),
          name: finalName,
          role: approvalRole,
          unitId: ['gestao'].includes(approvalRole) ? null : finalUnitId,
          sectorId: approvalSector,
        };
        // Cria o usuário server-side copiando o PIN da solicitação (ou o
        // override digitado pela gestão). É a RPC que grava tudo — o
        // onSaveUsers logo abaixo só põe a linha na lista da tela.
        const { error: rpcErr } = await supabase.rpc('create_user_from_request', {
          p_request_id: req.id,
          p_user_id: newUser.id,
          p_name: newUser.name,
          p_role: newUser.role,
          p_unit_id: newUser.unitId ?? null,
          p_sector_id: newUser.sectorId ?? null,
          p_pin: finalPin || null,
        });
        // Sem esta checagem, a RPC podia falhar (falhava: uuid = text, ver
        // 20260724_fix_aprovacao_uuid.sql) e o fluxo seguia marcando a
        // solicitação como aprovada. A pessoa ficava aprovada sem existir em
        // `users` — fora da lista de login e fora da fila de aprovação.
        if (rpcErr) throw new Error(`Não foi possível criar o acesso de ${newUser.name}: ${rpcErr.message}`);
        // Lista vazia de alterações = atualiza só o estado local e o cache, sem
        // reescrever nada. A RPC já gravou; reescrever daqui só criaria uma
        // segunda chance de falhar DEPOIS de o acesso já existir, e aí a
        // solicitação voltaria para a fila e seria aprovada duas vezes.
        await onSaveUsers([...users, newUser], { changedIds: [] });
      } else {
        // Apply changes to existing user
        const FIELD_MAP = {
          'Nome completo': 'name',
          'PIN de acesso': 'pin',
          'Telefone / WhatsApp': null, // not in users table
          'E-mail': null,
          'Setor / função': 'sectorId',
          'Outro': null,
        };
        const rawNote = req.note?.replace('[ALTERAÇÃO DE DADOS] ', '') || '';
        const parts = rawNote.split(' | ').filter(p => !p.startsWith('Obs:'));
        const existingUser = users.find(u => u.name === req.name);
        if (existingUser) {
          const updates = {};
          for (const part of parts) {
            const colonIdx = part.indexOf(':');
            if (colonIdx === -1) continue;
            const label = part.slice(0, colonIdx).trim();
            const fieldKey = `alt_${label}`;
            const value = editingReq[fieldKey] !== undefined
              ? editingReq[fieldKey]
              : part.slice(colonIdx + 1).trim();
            const userField = FIELD_MAP[label];
            if (userField) updates[userField] = value;
          }
          if (Object.keys(updates).length > 0) {
            // Aqui a gravação é MESMO daqui (não há RPC): se falhar, o erro
            // sobe, a solicitação continua na fila e nada é dado por aprovado.
            await onSaveUsers(
              users.map(u => u.id === existingUser.id ? { ...u, ...updates } : u),
              { changedIds: [existingUser.id] },
            );
          }
        }
      }

      // Update request status. Só reescreve `pin` se a gestão informou um novo;
      // caso contrário o PIN já gravado é mantido intacto.
      await supabase.from('user_requests').update({
        status: 'aprovado',
        name: finalName,
        ...(finalPin ? { pin: finalPin } : {}),
        note: finalNote,
        role: isAlteracao ? undefined : approvalRole,
        sector_id: isAlteracao ? undefined : approvalSector,
        reviewed_at: new Date().toISOString(),
        reviewed_by: currentUser.id,
      }).eq('id', req.id);

      // Send push notification to gestao/gerencia confirming action
      // and try to notify the user if they have a subscription
      try {
        const userName = users.find(u => u.name === req.name)?.id;
        if (userName) {
          const { data: subs } = await supabase
            .from('push_subscriptions')
            .select('endpoint, p256dh, auth')
            .eq('user_id', userName);
          if (subs?.length) {
            const msg = isAlteracao
              ? `Seus dados foram atualizados com sucesso.`
              : `Seu cadastro foi aprovado! Faça login com seu PIN.`;
            const { SUPABASE_URL, SUPABASE_ANON_KEY } = await import('../../lib/supabase');
            const r = await fetch(`${SUPABASE_URL}/functions/v1/notify-status`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json',
                Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
              body: JSON.stringify({ subs, title: 'ZCheck', body: msg }),
            }).catch(() => null);
            // O aviso de cadastro também é notificação: sem esta linha ele
            // ficava fora do "Histórico de notificações", que mostrava só
            // atraso. `sent` vem da própria função — quantos aparelhos
            // aceitaram, não quantos foram tentados.
            const entregues = r?.ok ? ((await r.json().catch(() => ({})))?.sent ?? 0) : 0;
            await supabase.from('notification_log').insert({
              unit_id: req.unit_id ?? null, kind: 'cadastro',
              title: 'ZCheck', body: msg,
              targets: subs.length, delivered: entregues,
            });
          }
        }
      } catch (_) {}

      setRequests(r => r.filter(x => x.id !== req.id));
      setReviewingRequest(null);
      setEditingReq({});
    } catch (e) {
      console.error(e);
      // Silenciar aqui foi o que deixou o bug da aprovação invisível por
      // semanas: a solicitação sumia da fila e ninguém sabia que o acesso não
      // tinha sido criado. Falhou, a gestão precisa ver — e a solicitação
      // continua na fila para tentar de novo.
      showToast(e?.message || 'Não foi possível aprovar. Tente de novo.');
    }
    setProcessingId(null);
  };

  const rejectRequest = async (req, confirmed = false) => {
    setProcessingId(req.id);
    try {
      const supabase = (await import('../../lib/supabase')).authedSupabase();
      await supabase.from('user_requests').update({
        status: confirmed ? 'aprovado' : 'rejeitado',
        reviewed_at: new Date().toISOString(),
        reviewed_by: currentUser.id,
      }).eq('id', req.id);
      setRequests(r => r.filter(x => x.id !== req.id));
      setReviewingRequest(null);
    } catch (e) {
      console.error(e);
      showToast(e?.message || 'Não foi possível concluir. Tente de novo.');
    }
    setProcessingId(null);
  };

  const handleSave = async u => {
    const novo = !u.id;
    const id = u.id || uid();
    const next = novo
      ? [...users, { ...u, id }]
      : users.map(x => x.id === id ? { ...x, ...u } : x);
    try {
      // `changedIds` manda para o banco só a linha mexida — salvar um usuário
      // não é motivo para reescrever a equipe inteira.
      await onSaveUsers(next, { changedIds: [id] });
      setEditing(null);
      showToast(novo ? 'Usuário criado!' : 'Usuário atualizado!');
    } catch (_) {
      // O motivo já foi ao toast em saveUsers. O editor continua aberto, com o
      // que foi digitado, para dar para corrigir e tentar de novo.
    }
  };

  const handleDelete = async u => {
    try {
      // `deleteIds` nomeia quem sai. Nada é inferido da lista.
      await onSaveUsers(users.filter(x => x.id !== u.id), { changedIds: [], deleteIds: [u.id] });
      showToast('Usuário removido.');
      setConfirmDelete(null);
    } catch (_) {
      // Toast do erro já subiu; o modal fica aberto para tentar de novo.
    }
  };

  if (editing) {
    return <UserEditor user={editing === 'new' ? null : editing} onSave={handleSave} onCancel={() => setEditing(null)} />;
  }

  // Approval modal
  if (reviewingRequest) {
    const req = reviewingRequest;
    const unitObj = units.find(u => u.id === req.unit_id);
    const isAlteracao = req.note?.startsWith('[ALTERAÇÃO DE DADOS]');
    // Setores da loja escolhida NESTE modal. Antes a condição era
    // `req.unit_id === 'ibr1'`: chumbada no IBR, então nenhuma outra empresa via
    // o seletor — e, como o cadastro passou a nascer sem loja (unit_id nulo),
    // nem o IBR via. O vínculo de setor só dava para fazer depois, editando o
    // usuário já aprovado. Mesma lógica do UserEditor, agora também aqui.
    const approvalSectorGroups = !['colaborador', 'lideranca'].includes(approvalRole) || !approvalUnit
      ? []
      : approvalUnit === 'ibr1'
        ? [
            { id: null, label: 'Todos os setores', desc: 'Vê checklists de toda a loja' },
            { id: 'salao', label: 'Salão', desc: 'Salão interno, Jardim, Bar e Caixa' },
            { id: 'cozinha', label: 'Cozinha', desc: 'Brunch, Produção, Pizza e Bowls' },
          ]
        : [
            { id: null, label: 'Todos os setores', desc: 'Vê checklists de toda a loja' },
            ...sectorRows
              .filter(s => (s.unit_id || s.unitId) === approvalUnit)
              .map(s => ({ id: s.id, label: s.name, desc: `Vê apenas os checklists de ${s.name}` })),
          ];

    return (
      <div className="zc-view space-y-3" style={{ paddingBottom: "calc(100px + env(safe-area-inset-bottom, 0px))" }}>
        <BackBar onBack={() => { setReviewingRequest(null); setEditingReq({}); setApprovalUnit(null); setApprovalUnits([]); }} label="Solicitações" accent={C.ink} />

        {/* Tipo badge + cabeçalho */}
        <Ticket accent={isAlteracao ? C.ink : C.warning}>
          <div className="flex items-center gap-2 mb-2">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: W.semibold, color: isAlteracao ? C.ink : C.warning, background: isAlteracao ? `${C.ink}15` : `${C.warning}1A`, padding: '2px 8px', borderRadius: 20 }}>
              {isAlteracao
                ? <><Pencil size={10} aria-hidden /> Alteração de dados</>
                : <><Plus size={10} aria-hidden /> Novo cadastro</>}
            </span>
            <span style={{ fontSize: 11, color: C.muted }}>{new Date(req.created_at).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })}</span>
          </div>
          <p className="font-display" style={{ fontWeight: W.semibold, fontSize: 'calc(17px * var(--zc-t-scale))', color: C.ink }}>{editingReq.name ?? req.name}</p>
          <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{unitObj?.name || req.unit_id || '—'}</p>
        </Ticket>

        {/* Dados completos da solicitação */}
        {!isAlteracao && (
          <>
            <Eyebrow>Dados do solicitante</Eyebrow>
            <div style={{ background: 'white', borderRadius: 10, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
              {[
                { label: 'Nome completo', field: 'name', value: req.name },
                { label: 'CPF', field: 'cpf', value: req.cpf },
                { label: 'Telefone / WhatsApp', field: 'phone', value: req.phone },
                { label: 'E-mail', field: 'email', value: req.email },
                // O PIN não é mais legível pelo anon — mostra vazio com dica.
                // Em branco = mantém o PIN escolhido no cadastro; digitar = substitui.
                { label: 'PIN de acesso', field: 'pin', value: '', placeholder: '•••• (mantido — digite para alterar)' },
                { label: 'Loja', field: null, value: unitObj?.name || req.unit_id },
              ].map(({ label, field, value, placeholder }, i) => (
                <div key={label} style={{ padding: '10px 14px', borderBottom: i < 5 ? `1px solid ${C.border}` : 'none' }}>
                  <p style={{ fontSize: 10, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.muted, marginBottom: 4 }}>{label}</p>
                  {field ? (
                    <input
                      value={editingReq[field] !== undefined ? editingReq[field] : (value || '')}
                      onChange={e => setEditingReq(prev => ({ ...prev, [field]: e.target.value }))}
                      placeholder={placeholder}
                      style={{ width: '100%', fontSize: 14, fontWeight: W.semibold, color: C.ink, background: 'transparent', border: 'none', outline: 'none', padding: 0 }}
                    />
                  ) : (
                    <p style={{ fontSize: 14, fontWeight: W.semibold, color: C.ink }}>{value || '—'}</p>
                  )}
                </div>
              ))}
            </div>

            {/* Selfie se existir */}
            {req.selfie_path && (
              <>
                <Eyebrow>Selfie de identificação</Eyebrow>
                <SelfieViewer path={req.selfie_path} />
              </>
            )}

            {/* Nível de acesso */}
            <Eyebrow>Nível de acesso</Eyebrow>
            <div className="space-y-2">
              {ROLES.map(r => (
                <button key={r} onClick={() => { setApprovalRole(r); setApprovalSector(null); setApprovalUnits([]); }} className="w-full text-left" style={{ background: 'none', border: 'none', padding: 0 }}>
                  <Ticket accent={r === approvalRole ? ROLE_COLORS[r] : C.border}>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-display" style={{ fontWeight: W.semibold, color: r === approvalRole ? ROLE_COLORS[r] : C.ink }}>{ROLE_LABELS[r]}</p>
                        <p style={{ fontSize: 12, color: C.muted }}>{ROLE_DESCRIPTIONS[r]}</p>
                      </div>
                      {r === approvalRole ? <CheckCircle2 size={20} color={ROLE_COLORS[r]} /> : <Circle size={20} color={C.mutedLight} />}
                    </div>
                  </Ticket>
                </button>
              ))}
            </div>

            {/* Loja — para colaborador, liderança e gerência */}
            {['colaborador','lideranca','gerencia'].includes(approvalRole) && (
              <>
                <Eyebrow>
                  {approvalRole === 'gerencia'
                    ? 'Lojas de vinculação (pode selecionar mais de uma)'
                    : 'Loja de vinculação'}
                </Eyebrow>
                <div className="flex gap-2">
                  {units.map(u => {
                    const isGerencia = approvalRole === 'gerencia';
                    const selected = isGerencia
                      ? approvalUnits.includes(u.id)
                      : approvalUnit === u.id;
                    return (
                      <button key={u.id}
                        onClick={() => {
                          if (isGerencia) {
                            // Toggle cumulative
                            setApprovalUnits(prev =>
                              prev.includes(u.id)
                                ? prev.filter(x => x !== u.id)
                                : [...prev, u.id]
                            );
                          } else {
                            setApprovalUnit(u.id);
                            setApprovalSector(null);
                          }
                        }}
                        className="flex-1 py-2"
                        style={{ borderRadius: 8, fontWeight: W.semibold, fontSize: 13, cursor: 'pointer',
                          background: selected ? u.color : 'white',
                          color: selected ? 'white' : C.ink,
                          border: `1.5px solid ${selected ? u.color : C.border}`,
                          position: 'relative' }}>
                        {u.name}
                        {isGerencia && selected && (
                          <span style={{ position: 'absolute', top: -4, right: -4, width: 14, height: 14, borderRadius: '50%', background: 'white', border: `2px solid ${u.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: u.color }}><Check size={9} strokeWidth={4} aria-hidden /></span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {approvalRole === 'gerencia' && approvalUnits.length === 0 && (
                  <p style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Nenhuma loja selecionada — acesso a todas as lojas</p>
                )}
              </>
            )}

            {/* Setor — colaborador e liderança, em QUALQUER empresa. Só some
                quando a loja não tem setor cadastrado (sobraria só "Todos"). */}
            {approvalSectorGroups.length > 1 && (
              <>
                <Eyebrow>Setor</Eyebrow>
                <div className="space-y-2">
                  {approvalSectorGroups.map(sg => {
                    const unitColor = units.find(u => u.id === approvalUnit)?.color || C.ink;
                    return (
                      <button key={String(sg.id)} onClick={() => setApprovalSector(sg.id)} className="w-full text-left" style={{ background: 'none', border: 'none', padding: 0 }}>
                        <Ticket accent={approvalSector === sg.id ? unitColor : C.border}>
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="font-display" style={{ fontWeight: W.semibold, color: approvalSector === sg.id ? unitColor : C.ink }}>{sg.label}</p>
                              <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{sg.desc}</p>
                            </div>
                            {approvalSector === sg.id ? <CheckCircle2 size={20} color={unitColor} /> : <Circle size={20} color={C.mutedLight} />}
                          </div>
                        </Ticket>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}

        {/* Alteração: dados solicitados editáveis — estruturado por campo */}
        {isAlteracao && (() => {
          const rawNote = req.note?.replace('[ALTERAÇÃO DE DADOS] ', '') || '';
          // Parse "Campo: Valor | Campo: Valor | Obs: ..."
          const parts = rawNote.split(' | ');
          const fields = parts
            .filter(p => !p.startsWith('Obs:'))
            .map(p => {
              const colonIdx = p.indexOf(':');
              return colonIdx > -1
                ? { label: p.slice(0, colonIdx).trim(), value: p.slice(colonIdx + 1).trim() }
                : { label: p, value: '' };
            });
          const obs = parts.find(p => p.startsWith('Obs:'))?.replace('Obs: ', '') || '';
          return (
            <>
              <Eyebrow>Dados solicitados para alteração</Eyebrow>
              <div style={{ background: 'white', borderRadius: 10, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
                {fields.map(({ label, value }, i) => {
                  const fieldKey = `alt_${label}`;
                  return (
                    <div key={label} style={{ padding: '10px 14px', borderBottom: i < fields.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                      <p style={{ fontSize: 10, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.muted, marginBottom: 4 }}>{label}</p>
                      <input
                        value={editingReq[fieldKey] !== undefined ? editingReq[fieldKey] : value}
                        onChange={e => setEditingReq(prev => ({ ...prev, [fieldKey]: e.target.value }))}
                        style={{ width: '100%', fontSize: 14, fontWeight: W.semibold, color: C.ink, background: 'transparent', border: 'none', outline: 'none', padding: 0 }}
                      />
                    </div>
                  );
                })}
                {obs && (
                  <div style={{ padding: '10px 14px', background: C.bg }}>
                    <p style={{ fontSize: 10, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.muted, marginBottom: 4 }}>Observação</p>
                    <p style={{ fontSize: 13, color: C.ink }}>{obs}</p>
                  </div>
                )}
              </div>
            </>
          );
        })()}

        {/* Botões de ação */}
        <div className="zc-actionbar fixed left-0 right-0 p-3 flex gap-2" style={{ bottom: "calc(var(--zc-nav-h) + env(safe-area-inset-bottom, 0px))", background: 'rgba(250,246,239,0.96)', borderTop: `1px solid ${C.border}`, zIndex: 90 }}>
          <button onClick={() => rejectRequest(req)} disabled={!!processingId} className="flex-1 py-3"
            style={{ borderRadius: 6, border: `1px solid ${C.critical}`, fontWeight: W.semibold, color: C.critical, background: 'white', cursor: 'pointer' }}>
            {isAlteracao ? 'Recusar' : 'Rejeitar'}
          </button>
          <button onClick={() => approveRequest(req)} disabled={!!processingId} className="flex-1 py-3"
            style={{ borderRadius: 6, border: 'none', fontWeight: W.semibold, color: 'white', background: C.success, cursor: 'pointer' }}>
            {processingId ? 'Processando…' : isAlteracao ? 'Confirmar alteração' : 'Aprovar cadastro'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="zc-view space-y-3">

      {/* Solicitações — apenas Diretoria */}
      {currentUser?.role === 'gestao' && (
        <>
          <Eyebrow>Solicitações pendentes {requests.length > 0 ? `(${requests.length})` : ''}</Eyebrow>
          {requests.length === 0 ? (
            <Ticket accent={C.border}>
              <p style={{ fontSize: 13, color: C.muted, textAlign: 'center', padding: '8px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <CheckCircle2 size={14} aria-hidden /> Nenhuma solicitação pendente
              </p>
            </Ticket>
          ) : (
          <div className="space-y-2">
            {requests.map(req => {
              const unitObj = units.find(u => u.id === req.unit_id);
              const isAlteracao = req.note?.startsWith('[ALTERAÇÃO DE DADOS]');
              return (
                <button
                  key={req.id}
                  // O cadastro não pede loja (unit_id nasce nulo): o padrão tem de
                  // ser a primeira loja DESTA empresa — 'ibr1' chumbado
                  // pré-selecionava loja de outro tenant.
                  onClick={() => { setReviewingRequest(req); setApprovalRole('colaborador'); setApprovalUnit(req.unit_id || units[0]?.id || ''); setApprovalUnits([]); setApprovalSector(null); setEditingReq({}); }}
                  className="w-full text-left"
                  style={{ background: 'none', border: 'none', padding: 0 }}
                >
                  <Ticket accent={isAlteracao ? C.ink : C.warning}>
                    <div className="flex items-center justify-between gap-2">
                      <div style={{ minWidth: 0 }}>
                        <p className="font-display" style={{ fontWeight: W.semibold, color: C.ink }}>{truncName(req.name)}</p>
                        <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                          {unitObj?.name || req.unit_id || '—'} · {new Date(req.created_at).toLocaleDateString('pt-BR')}
                        </p>
                        {isAlteracao && (
                          <p style={{ fontSize: 11, color: C.ink, marginTop: 3, fontStyle: 'italic' }}>
                            {req.note?.replace('[ALTERAÇÃO DE DADOS] ', '').slice(0, 60)}…
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: W.semibold, color: isAlteracao ? C.ink : C.warning, background: isAlteracao ? `${C.ink}15` : `${C.warning}1A`, padding: '3px 8px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                          {isAlteracao
                            ? <><Pencil size={10} aria-hidden /> Alteração</>
                            : <><Plus size={10} aria-hidden /> Novo cadastro</>}
                        </span>
                        <ChevronRight size={16} color={C.muted} />
                      </div>
                    </div>
                  </Ticket>
                </button>
              );
            })}
          </div>
          )}
        </>
      )}

      {/* Link do app */}
      <Eyebrow>Link do app</Eyebrow>
      <Ticket accent={C.border}>
        <p style={{ fontSize: 13, color: C.muted, marginBottom: 8 }}>
          Compartilhe este link com colaboradores para acessar o app:
        </p>
        <div className="flex items-center gap-2">
          <p style={{ fontSize: 13, fontWeight: W.semibold, color: C.ink, flex: 1, wordBreak: 'break-all' }}>
            {typeof window !== 'undefined' ? window.location.origin : 'https://zcheckapp.com'}
          </p>
          <CopyLinkButton url={typeof window !== 'undefined' ? window.location.origin : 'https://zcheckapp.com'} />
        </div>
      </Ticket>

      {/* "Nova empresa" saiu daqui (fluxo interno da equipe, não do gestor do
          tenant). "Importar CSV" foi para a aba Gerenciar. */}
      {/* Users list */}
      <Eyebrow>Usuários e níveis de acesso</Eyebrow>
      {/* Resumo de quem não recebe alerta. Fica ANTES da lista porque o marcador
          por linha resolve "quem", e este bloco resolve "quantos e o que fazer" —
          sem ele a gestão precisaria varrer a lista para descobrir o tamanho do
          problema. Só aparece quando há alguém de fora: empresa com todos
          inscritos não ganha um aviso permanente para ignorar. */}
      {(() => {
        if (!(pushPorUsuario instanceof Map)) return null;
        const fora = users.filter(u => !u.suspended && semPush(u));
        if (fora.length === 0) return null;
        const ativos = users.filter(u => !u.suspended).length;
        return (
          <div className="flex items-start gap-2 px-3 py-2" style={{ background: `${C.warning}14`, border: `1px solid ${C.warning}`, borderRadius: 10 }}>
            <BellOff size={16} color={C.warning} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden />
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: W.semibold, color: C.ink }}>
                {fora.length} de {ativos} sem notificação ativa
              </p>
              <p style={{ fontSize: 12, color: C.muted, marginTop: 2, lineHeight: 1.5 }}>
                Essas pessoas não recebem alerta de checklist atrasado nem de entrega
                incompleta. Cada uma precisa ativar no próprio aparelho, em "Notif. OFF"
                no topo do app — não há como ativar por elas daqui. No iPhone, só
                funciona com o app instalado na Tela de Início.
              </p>
            </div>
          </div>
        );
      })()}
      <div className="space-y-2">
        {users.map(u => {
          const lastGestao = u.role === 'gestao' && gestaoCount <= 1;
          return (
            <Ticket key={u.id} accent={ROLE_COLORS[u.role]}>
              <div className="flex items-center justify-between gap-2">
                <div style={{ minWidth: 0 }}>
                  <div className="flex items-center gap-2">
                    <p className="font-display" style={{ fontWeight: W.semibold, color: C.ink }}>{truncName(u.name)}</p>
                    <span title={onlineUsers.has(u.id) ? 'Online' : 'Offline'} style={{ width: 8, height: 8, borderRadius: '50%', background: onlineUsers.has(u.id) ? C.success : C.border, flexShrink: 0, display: 'inline-block' }} />
                    {u.suspended && (
                      <span style={{ fontSize: 10, fontWeight: W.semibold, color: C.critical, background: '#FFF3F0', border: `1px solid ${C.critical}`, borderRadius: 20, padding: '1px 7px', letterSpacing: '0.04em' }}>
                        SUSPENSO
                      </span>
                    )}
                    {!u.suspended && semPush(u) && (
                      <span
                        title="Não recebe alerta de atraso nem de entrega incompleta. Só a própria pessoa pode ativar, no aparelho dela."
                        className="flex items-center gap-1"
                        style={{ fontSize: 10, fontWeight: W.semibold, color: C.warning, background: `${C.warning}18`, border: `1px solid ${C.warning}`, borderRadius: 20, padding: '1px 7px', letterSpacing: '0.04em' }}
                      >
                        <BellOff size={10} /> SEM NOTIFICAÇÃO
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                    <span style={{ fontWeight: W.semibold, color: ROLE_COLORS[u.role] }}>{ROLE_LABELS[u.role]}</span>
                    {' · '}{u.unitId ? units.find(x => x.id === u.unitId)?.name : 'Todas as lojas'}
                    {' · PIN '}{u.pin}
                  </p>
                </div>
                <div className="flex gap-2" style={{ flexShrink: 0 }}>
                  <button onClick={() => setEditing(u)} className="p-2" style={{ borderRadius: 6, border: `1px solid ${C.border}`, background: 'white' }}>
                    <Settings2 size={16} color={C.muted} />
                  </button>
                  <button
                    onClick={() => !lastGestao && setConfirmDelete(u)}
                    disabled={lastGestao}
                    className="p-2"
                    style={{ borderRadius: 6, border: `1px solid ${C.border}`, background: 'white', opacity: lastGestao ? 0.4 : 1 }}
                  >
                    <Trash2 size={16} color={C.critical} />
                  </button>
                </div>
              </div>
              {lastGestao && <p style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>Não é possível remover o último usuário de Diretoria.</p>}
            </Ticket>
          );
        })}
      </div>

      <button
        onClick={() => setEditing('new')}
        className="flex items-center justify-center gap-2 w-full py-3"
        style={{ borderRadius: 6, border: `2px dashed ${C.ink}`, fontWeight: W.semibold, color: C.ink, background: 'none' }}
      >
        <Plus size={16} /> Novo usuário
      </button>

      {confirmDelete && (
        <div className="fixed inset-0 flex items-center justify-center p-4 z-50" style={{ background: 'rgba(32,48,43,0.5)' }}>
          <div className="w-full" style={{ maxWidth: 360, background: 'white', borderRadius: 10, padding: 16 }}>
            <p className="font-display" style={{ fontWeight: W.semibold, color: C.ink, marginBottom: 8 }}>Remover {confirmDelete.name}?</p>
            <p style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>Essa pessoa não poderá mais acessar o app com este usuário.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 py-2" style={{ borderRadius: 6, border: `1px solid ${C.border}`, fontWeight: W.semibold, color: C.ink, background: 'white' }}>
                Cancelar
              </button>
              <button onClick={() => handleDelete(confirmDelete)} className="flex-1 py-2" style={{ borderRadius: 6, border: 'none', fontWeight: W.semibold, color: 'white', background: C.critical }}>
                Remover
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ----------------------------- push modal --------------------------------- */

function PushPermissionModal({ onAllow, onDismiss }) {
  return (
    <div
      className="fixed inset-0 flex items-end justify-center z-50"
      style={{ background: 'rgba(11,60,92,0.5)' }}
      onClick={onDismiss}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full zc-sheet-panel"
        style={{
          maxWidth: 480, background: 'white',
          borderRadius: '20px 20px 0 0',
          padding: '24px 24px 40px',
          paddingBottom: 'calc(40px + env(safe-area-inset-bottom, 0px))',
        }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div style={{ width: 48, height: 48, borderRadius: 12, background: '#063C5C1A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Bell size={24} color="#063C5C" />
          </div>
          <div>
            <p className="font-display" style={{ fontWeight: W.semibold, fontSize: 'calc(17px * var(--zc-t-scale))', color: '#063C5C' }}>Ativar notificações</p>
            <p style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>Fique por dentro dos checklists atrasados</p>
          </div>
        </div>

        <p style={{ fontSize: 14, color: '#063C5C', lineHeight: 1.6, marginBottom: 24 }}>
          Você receberá um aviso automático no celular quando um checklist passar do horário limite sem ter sido concluído — mesmo com o app fechado.
        </p>

        <button
          onClick={onAllow}
          className="w-full py-3 mb-3"
          style={{ borderRadius: 10, background: '#063C5C', color: 'white', fontWeight: W.semibold, fontSize: 15, border: 'none', cursor: 'pointer' }}
        >
          Ativar notificações
        </button>
        <button
          onClick={onDismiss}
          className="w-full py-2"
          style={{ borderRadius: 10, background: 'none', color: C.muted, fontWeight: W.semibold, fontSize: 13, border: 'none', cursor: 'pointer' }}
        >
          Agora não
        </button>
      </div>
    </div>
  );
}

/**
 * Troca da foto de perfil. Uma folha só, com prévia antes de salvar — sem
 * prévia a pessoa só descobre que a foto ficou torta depois de ela já estar
 * em todas as telas.
 *
 * `capture` NÃO é usado no input: no celular ele força a câmera e tira do
 * usuário a opção de escolher uma foto que já existe na galeria. (Na foto de
 * evidência de checklist é o contrário — lá a câmera é o ponto.)
 */
function AvatarPickerModal({ user, accent, onClose, onSave }) {
  const [preview, setPreview] = useState(null);   // dataURL novo, ainda não salvo
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');
  const fileRef = useRef(null);
  const hasPhoto = !!user?.avatarUrl;

  const onPick = async e => {
    const file = e.target.files?.[0];
    e.target.value = '';               // permite reescolher o MESMO arquivo
    if (!file) return;
    setErro('');
    if (!file.type?.startsWith('image/')) { setErro('Escolha um arquivo de imagem.'); return; }
    try {
      // 320px e qualidade 0.8: o maior uso é um círculo de 52px (o ID
      // operacional), então 320 cobre telas retina com folga e o arquivo cai
      // para dezenas de KB — importante porque muita loja sobe pelo 4G.
      setPreview(await compressImage(file, 320, 0.8));
    } catch (_) {
      setErro('Não foi possível ler essa imagem. Tente outra.');
    }
  };

  const commit = async value => {
    setBusy(true); setErro('');
    const ok = await onSave(value);
    setBusy(false);
    if (ok) onClose();
    else setErro('Não foi possível salvar agora. Verifique a conexão e tente de novo.');
  };

  return (
    <div className="fixed inset-0 flex items-end justify-center z-50"
      style={{ background: 'rgba(11,60,92,0.5)' }} onClick={busy ? undefined : onClose}>
      <div onClick={e => e.stopPropagation()} className="w-full zc-sheet-panel"
        role="dialog" aria-modal="true" aria-label="Foto de perfil"
        style={{
          maxWidth: 480, background: 'white', borderRadius: '20px 20px 0 0',
          padding: '24px 24px 40px', paddingBottom: 'calc(40px + env(safe-area-inset-bottom, 0px))',
        }}>
        <p className="font-display" style={{ fontWeight: W.semibold, fontSize: 'calc(17px * var(--zc-t-scale))', color: C.ink }}>Foto de perfil</p>
        <p style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>
          Aparece no cabeçalho, no seu ID e no ranking da equipe.
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', margin: '20px 0' }}>
          <Avatar user={preview ? { name: user?.name, avatarUrl: preview } : user}
            size={104} bg={`${accent}18`} fg={accent}
            style={{ border: `3px solid ${accent}33` }} />
        </div>

        {erro && (
          <p role="alert" style={{ fontSize: 13, color: C.critical, textAlign: 'center', marginBottom: 12 }}>{erro}</p>
        )}

        <input ref={fileRef} type="file" accept="image/*" onChange={onPick} style={{ display: 'none' }} />

        {preview ? (
          <>
            <button onClick={() => commit(preview)} disabled={busy} className="w-full py-3 mb-3"
              style={{ borderRadius: 10, background: accent, color: 'white', fontWeight: W.semibold, fontSize: 15, border: 'none', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}>
              {busy ? 'Salvando…' : 'Salvar foto'}
            </button>
            <button onClick={() => setPreview(null)} disabled={busy} className="w-full py-2"
              style={{ borderRadius: 10, background: 'none', color: C.muted, fontWeight: W.semibold, fontSize: 13, border: 'none', cursor: 'pointer' }}>
              Escolher outra
            </button>
          </>
        ) : (
          <>
            <button onClick={() => fileRef.current?.click()} disabled={busy} className="w-full py-3 mb-3"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 10, background: accent, color: 'white', fontWeight: W.semibold, fontSize: 15, border: 'none', cursor: 'pointer' }}>
              <Camera size={17} aria-hidden /> {hasPhoto ? 'Trocar foto' : 'Escolher foto'}
            </button>
            {hasPhoto && (
              <button onClick={() => commit(null)} disabled={busy} className="w-full py-2 mb-1"
                style={{ borderRadius: 10, background: 'none', color: C.critical, fontWeight: W.semibold, fontSize: 13, border: 'none', cursor: busy ? 'default' : 'pointer' }}>
                {busy ? 'Removendo…' : 'Remover foto'}
              </button>
            )}
            <button onClick={onClose} disabled={busy} className="w-full py-2"
              style={{ borderRadius: 10, background: 'none', color: C.muted, fontWeight: W.semibold, fontSize: 13, border: 'none', cursor: 'pointer' }}>
              Fechar
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ----------------------------- folgas view -------------------------------- */

function FolgasView({ unit, closures, onSaveClosures, canSeeAllUnits }) {
  const units = useUnits(); // unidades da empresa logada (antes: constante do IBR)
  const [selectedUnitId, setSelectedUnitId] = useState(canSeeAllUnits ? unit.id : unit.id);
  // O calendário de folgas é da loja SELECIONADA, não da loja base: marcar
  // "hoje" numa loja em Manaus tem que casar com o dia lá.
  const today = todayStr(tzOfUnit(units, selectedUnitId));
  const [month, setMonth] = useState(() => today.slice(0, 7)); // YYYY-MM

  const [year, mon] = month.split('-').map(Number);
  const firstDay = new Date(year, mon - 1, 1);
  const lastDay = new Date(year, mon, 0);
  const startWd = firstDay.getDay(); // 0=Sun
  const daysInMonth = lastDay.getDate();

  const shiftMonth = delta => {
    const d = new Date(year, mon - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const isClosed = date => closures.some(c => c.unitId === selectedUnitId && c.date === date);
  const selectedUnit = units.find(u => u.id === selectedUnitId);

  const toggleDay = date => {
    let next;
    if (isClosed(date)) {
      next = closures.filter(c => !(c.unitId === selectedUnitId && c.date === date));
    } else {
      next = [...closures, { unitId: selectedUnitId, date }];
    }
    onSaveClosures(next);
  };

  const closedThisMonth = closures.filter(c =>
    c.unitId === selectedUnitId && c.date.startsWith(month)
  ).sort((a, b) => a.date.localeCompare(b.date));

  const monthLabel = new Date(year, mon - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const WD_LABELS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

  return (
    <div className="zc-view space-y-4">
      <Eyebrow>Dias de folga / loja fechada</Eyebrow>
      <p style={{ fontSize: 13, color: C.muted }}>
        Dias marcados são excluídos dos checklists e não contabilizados nos relatórios.
      </p>

      {canSeeAllUnits && (
        <div className="flex gap-2">
          {units.map(u => (
            <PillButton key={u.id} active={selectedUnitId === u.id} accent={u.color} onClick={() => setSelectedUnitId(u.id)}>
              {u.name}
            </PillButton>
          ))}
        </div>
      )}

      {/* Month navigator */}
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => shiftMonth(-1)} style={{ background: 'white', border: `1.5px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', cursor: 'pointer' }}>
          <ArrowLeft size={16} color={C.ink} />
        </button>
        <p className="font-display" style={{ fontWeight: W.semibold, fontSize: 15, color: C.ink, textTransform: 'capitalize' }}>{monthLabel}</p>
        <button onClick={() => shiftMonth(1)} style={{ background: 'white', border: `1.5px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', cursor: 'pointer' }}>
          <ChevronRight size={16} color={C.ink} />
        </button>
      </div>

      {/* Calendar grid */}
      <div style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
        {/* Weekday headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', background: C.bg, borderBottom: `1px solid ${C.border}` }}>
          {WD_LABELS.map((l, i) => (
            <div key={i} style={{ padding: '6px 0', textAlign: 'center', fontSize: 11, fontWeight: W.semibold, color: i === 0 || i === 6 ? C.critical : C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {l}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
          {/* Empty cells before first day */}
          {Array.from({ length: startWd }).map((_, i) => (
            <div key={`e${i}`} style={{ padding: '10px 0' }} />
          ))}
          {/* Day cells */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dateStr = `${month}-${String(day).padStart(2, '0')}`;
            const closed = isClosed(dateStr);
            const isToday = dateStr === today;
            const isPast = dateStr < today;
            return (
              <button
                key={day}
                onClick={() => toggleDay(dateStr)}
                style={{
                  padding: '10px 0',
                  textAlign: 'center',
                  fontSize: 13,
                  fontWeight: isToday ? 800 : 500,
                  background: closed ? `${selectedUnit.color}` : 'transparent',
                  color: closed ? 'white' : isToday ? selectedUnit.color : isPast ? C.mutedLight : C.ink,
                  border: 'none',
                  cursor: 'pointer',
                  position: 'relative',
                  borderRadius: 0,
                }}
              >
                {day}
                {isToday && !closed && (
                  <div style={{ position: 'absolute', bottom: 3, left: '50%', transform: 'translateX(-50%)', width: 4, height: 4, borderRadius: '50%', background: selectedUnit.color }} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4" style={{ fontSize: 12, color: C.muted }}>
        <span className="flex items-center gap-1">
          <div style={{ width: 14, height: 14, borderRadius: 3, background: selectedUnit.color }} />
          Loja fechada
        </span>
        <span className="flex items-center gap-1">
          <div style={{ width: 14, height: 14, borderRadius: 3, background: C.border }} />
          Dia normal
        </span>
      </div>

      {/* List of closed days this month */}
      {closedThisMonth.length > 0 && (
        <>
          <Eyebrow>Folgas em {monthLabel} — {selectedUnit.name}</Eyebrow>
          <div className="space-y-1.5">
            {closedThisMonth.map(c => {
              const d = new Date(`${c.date}T00:00:00`);
              const label = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
              return (
                <div key={c.date} className="flex items-center justify-between px-3 py-2" style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: W.semibold, color: C.ink, textTransform: 'capitalize' }}>{label}</span>
                  <button
                    onClick={() => toggleDay(c.date)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.critical, fontWeight: W.semibold, fontSize: 12 }}
                  >
                    <X size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* ── UserDataChangeModal ── */
function UserDataChangeModal({ currentUser, onClose }) {
  const FIELDS = [
    { id: 'nome', label: 'Nome completo', placeholder: 'Novo nome completo', type: 'text' },
    { id: 'telefone', label: 'Telefone / WhatsApp', placeholder: '(00) 00000-0000', type: 'tel' },
    { id: 'email', label: 'E-mail', placeholder: 'seu@email.com', type: 'email' },
    { id: 'pin', label: 'PIN de acesso', placeholder: 'Novo PIN (4 dígitos)', type: 'tel' },
    { id: 'setor', label: 'Setor / função', placeholder: 'Ex: Cozinha, Salão…', type: 'text' },
    { id: 'outro', label: 'Outro', placeholder: 'Descreva a alteração…', type: 'text' },
  ];

  const [selected, setSelected] = useState(new Set());
  const [values, setValues] = useState({});
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const toggleField = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  };

  const handleSubmit = async () => {
    if (selected.size === 0) { setError('Selecione ao menos um campo.'); return; }
    const missing = [...selected].find(id => !values[id]?.trim());
    if (missing) { setError(`Preencha o campo "${FIELDS.find(f=>f.id===missing)?.label}".`); return; }
    setLoading(true); setError('');
    try {
      const supabase = (await import('../../lib/supabase')).authedSupabase();
      const changes = [...selected].map(id => {
        const f = FIELDS.find(f=>f.id===id);
        return `${f.label}: ${values[id].trim()}`;
      }).join(' | ');
      await supabase.from('user_requests').insert({
        name: currentUser.name,
        unit_id: currentUser.unitId,
        status: 'pendente',
        note: `[ALTERAÇÃO DE DADOS] ${changes}${note.trim() ? ' | Obs: '+note.trim() : ''}`,
        pin: currentUser.pin || '0000',
      });
      setSent(true);
    } catch(e) { setError('Erro ao enviar. Tente novamente.'); }
    setLoading(false);
  };

  const inputStyle = { width: '100%', fontSize: 14, fontWeight: W.semibold, padding: '12px 10px', borderRadius: 8, border: `1.5px solid ${C.border}`, outline: 'none', background: 'white', color: C.ink, fontFamily: 'inherit', marginTop: 6 };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={onClose}>
      <div className="w-full zc-sheet-panel" style={{ maxWidth: 480, background: C.bg, borderRadius: '20px 20px 0 0', maxHeight: '90vh', overflowY: 'auto', paddingBottom: 'calc(32px + env(safe-area-inset-bottom, 0px))' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2" style={{ borderBottom: `1px solid ${C.border}` }}>
          <p className="font-display" style={{ fontSize: 16, fontWeight: W.semibold, color: C.ink }}>Solicitar alteração de dados</p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: C.muted, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {sent ? (
          <div style={{ textAlign: 'center', padding: '28px 24px' }}>
            <CheckCircle2 size={40} color={C.success} strokeWidth={1.5} aria-hidden style={{ margin: '0 auto 12px' }} />
            <p style={{ fontSize: 15, fontWeight: W.semibold, color: C.success, marginBottom: 6 }}>Solicitação enviada!</p>
            <p style={{ fontSize: 13, color: C.muted, marginBottom: 20, lineHeight: 1.5 }}>Sua solicitação será analisada em breve. Você será contatado quando houver retorno.</p>
            <button onClick={onClose} style={{ padding: '10px 28px', borderRadius: 8, background: C.ink, color: 'white', border: 'none', fontWeight: W.semibold, fontSize: 13, cursor: 'pointer' }}>
              Fechar
            </button>
          </div>
        ) : (
          <div className="px-4 pt-3 space-y-4">
            <p style={{ fontSize: 12, color: C.muted }}>
              Usuário: <strong style={{ color: C.ink }}>{currentUser.name}</strong>
            </p>

            {/* Field selector */}
            <div>
              <p style={{ fontSize: 10, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.muted, marginBottom: 8 }}>
                O que deseja alterar? (pode selecionar mais de um)
              </p>
              <div className="flex flex-wrap gap-2">
                {FIELDS.map(f => {
                  const on = selected.has(f.id);
                  return (
                    <button key={f.id} onClick={() => toggleField(f.id)}
                      style={{ fontSize: 12, fontWeight: W.semibold, padding: '6px 14px', borderRadius: 20,
                        background: on ? C.ink : 'white', color: on ? 'white' : C.ink,
                        border: `1.5px solid ${on ? C.ink : C.border}`, cursor: 'pointer',
                        display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      {on && <Check size={12} aria-hidden />}{f.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Dynamic fields for selected items */}
            {[...selected].map(id => {
              const f = FIELDS.find(f=>f.id===id);
              return (
                <div key={id} style={{ background: 'white', borderRadius: 10, padding: '14px 14px 10px', border: `1.5px solid ${C.border}` }}>
                  <p style={{ fontSize: 11, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.muted }}>{f.label}</p>
                  <input
                    type={f.type}
                    inputMode={f.type === 'tel' ? 'numeric' : undefined}
                    value={values[id] || ''}
                    onChange={e => setValues(v => ({ ...v, [id]: e.target.value }))}
                    placeholder={f.placeholder}
                    style={inputStyle}
                  />
                </div>
              );
            })}

            {/* Observação */}
            {selected.size > 0 && (
              <div style={{ background: 'white', borderRadius: 10, padding: '14px 14px 10px', border: `1.5px solid ${C.border}` }}>
                <p style={{ fontSize: 11, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.muted }}>Observação (opcional)</p>
                <textarea
                  value={note} onChange={e => setNote(e.target.value)}
                  placeholder="Motivo ou informação adicional…"
                  rows={2}
                  style={{ ...inputStyle, resize: 'none' }}
                />
              </div>
            )}

            {error && <p style={{ fontSize: 12, color: C.critical, fontWeight: W.semibold }}>{error}</p>}

            <button onClick={handleSubmit} disabled={loading || selected.size === 0}
              style={{ width: '100%', padding: '13px', borderRadius: 10, background: selected.size > 0 ? C.ink : C.border, color: 'white', border: 'none', fontWeight: W.semibold, fontSize: 14, cursor: selected.size > 0 ? 'pointer' : 'default', opacity: loading ? 0.6 : 1 }}>
              {loading ? 'Enviando…' : `Enviar solicitação${selected.size > 1 ? ` (${selected.size} campos)` : ''}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* --------------------------------- shell ----------------------------------- */

export function Header({ unit, onSelectUnit, allSelected, currentUser, canSwitchUnit, onLogout, isOnline, syncing, pendingSync, pushEnabled, onEnablePush, onDisablePush, company, allUnits, onStartTour, trialDaysLeft, onOpenPlans, onOpenAvatar }) {
  // As unidades vêm por prop (as da própria empresa). Antes o Header lia a
  // constante UNITS (IBR1/2/3), então toda empresa via as lojas do IBR aqui.
  const unitList = allUnits?.length ? allUnits : UNITS;
  const dateLabel = new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase();
  const roleColor = ROLE_COLORS[currentUser.role];
  const [showDataChange, setShowDataChange] = useState(false);
  return (
    <header className="sticky top-0 z-10" style={{ background: C.bg, borderBottom: `1px solid ${C.border}` }}>
      {showDataChange && (
        <UserDataChangeModal currentUser={currentUser} onClose={() => setShowDataChange(false)} />
      )}
      {/* Contador de teste — DENTRO do header sticky para ficar sempre visível
          (antes era irmão do header e sumia no scroll — pedido 18/07). */}
      {trialDaysLeft != null && (
        <button onClick={onOpenPlans}
          style={{ width: '100%', border: 'none', cursor: 'pointer', background: C.ink, color: 'white',
            fontSize: 12.5, fontWeight: W.semibold, padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <span>Teste grátis · {trialDaysLeft} {trialDaysLeft === 1 ? 'dia restante' : 'dias restantes'}</span>
          <span style={{ textDecoration: 'underline' }}>Assinar</span>
        </button>
      )}
      {!isOnline && (
        <div className="flex items-center justify-center gap-2 px-4 py-2" style={{ background: C.critical, color: 'white' }}>
          <WifiOff size={14} />
          <span style={{ fontSize: 12, fontWeight: W.semibold }}>Sem conexão — dados salvos localmente{pendingSync > 0 ? ` (${pendingSync} pendente${pendingSync > 1 ? 's' : ''})` : ''}</span>
        </div>
      )}
      {isOnline && syncing && (
        <div className="flex items-center justify-center gap-2 px-4 py-2" style={{ background: C.pending, color: '#fff' }}>
          <RefreshCw size={14} />
          <span style={{ fontSize: 12, fontWeight: W.semibold }}>Sincronizando…</span>
        </div>
      )}
      {/* ── HEADER ── Fundo claro + logo horizontal, igual à landing (era uma
          faixa azul #063C5C com o ícone). */}
      {/* Cabeçalho: logo do ZCheck FIXO, com link para a landing. */}
      {/* No desktop esta faixa é redundante — o rail lateral já carrega o logo —
          e custa 64px do recurso mais escasso da tela grande, que é altura.
          `.zc-logoband` some >= 1024px (globals.css). No celular, intacta. */}
      <div className="zc-logoband" style={{
        width: '100%', display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: '0 16px',
        height: 64, background: 'white', borderBottom: `1px solid ${C.border}`,
        marginBottom: 0,
      }}>
        <a href="https://zcheckapp.com" aria-label="ZCheck" style={{ display: 'block' }}>
          <img src="/zcheck-logo.png" alt="ZCheck"
            style={{ display: 'block', height: 32, width: 'auto', objectFit: 'contain' }} />
        </a>
      </div>

      <div className="zc-headerbar px-4 pt-3 pb-2">
      {/* Linha de data: logo PRÓPRIO da empresa quando existe; senão, nada
          (sem fallback do ZCheck aqui — ele já está no cabeçalho). */}
      <div className="zc-hdr-info flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {company?.logo_url && (
            <img src={company.logo_url} alt={company?.name || 'Empresa'} style={{ maxHeight: 28, maxWidth: 80, objectFit: 'contain' }} />
          )}
          <p style={{ fontSize: 11, letterSpacing: '0.08em', color: C.muted, fontWeight: W.semibold }}>{dateLabel}</p>
        </div>
        {/* Este é o ÚNICO ponto de troca de foto visível em todas as telas e
            para todos os papéis — gerência e diretoria não têm a aba "Meu ID"
            (ver ROLE_TABS), então prendê-la só ao ID deixaria os dois de fora. */}
        <button onClick={onOpenAvatar} disabled={!onOpenAvatar}
          title="Foto de perfil" aria-label={`Foto de perfil de ${currentUser.name}`}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: onOpenAvatar ? 'pointer' : 'default', font: 'inherit' }}>
          <span style={{ position: 'relative', display: 'block', flexShrink: 0 }}>
            {currentUser.avatarUrl
              ? <Avatar user={currentUser} size={26} bg={`${roleColor}1A`} fg={roleColor} />
              : (
                <span style={{ width: 26, height: 26, borderRadius: 999, background: `${roleColor}1A`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <User size={13} color={roleColor} />
                </span>
              )}
            {onOpenAvatar && (
              <span aria-hidden="true" style={{
                position: 'absolute', right: -3, bottom: -3, width: 13, height: 13, borderRadius: 999,
                background: 'white', border: `1px solid ${C.border}`, display: 'grid', placeItems: 'center',
              }}>
                <Camera size={8} color={C.muted} />
              </span>
            )}
          </span>
          <span>
            <p style={{ fontSize: 12, fontWeight: W.semibold, color: C.ink }}>{truncName(currentUser.name, 16)}</p>
            <p style={{ fontSize: 9, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.08em', color: roleColor }}>{ROLE_LABELS[currentUser.role]}</p>
          </span>
        </button>
      </div>

      <div className="zc-hdr-actions flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
        </div>
        <div className="flex items-center gap-3">
          {/* Central de Ajuda — visível para todos os papéis */}
          <a href="/ajuda" title="Central de Ajuda"
            className="flex items-center gap-1"
            style={{ color: C.muted, fontSize: 10, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0, textDecoration: 'none' }}>
            <HelpCircle size={15} /> Ajuda
          </a>
          {/* Tour guiado sob demanda — quem pulou no 1º acesso pode voltar quando quiser */}
          {onStartTour && MANAGER_ROLES.includes(currentUser.role) && (
            <button onClick={onStartTour} title="Tour guiado pelas funcionalidades"
              className="flex items-center gap-1"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 10, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>
              <PlayCircle size={15} /> Tour
            </button>
          )}
          {currentUser.role === 'gestao' && (
            <button
              onClick={pushEnabled ? onDisablePush : onEnablePush}
              title={pushEnabled ? 'Desativar notificações' : 'Ativar notificações'}
              style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: pushEnabled ? C.success : C.muted }}
            >
              {pushEnabled ? <Bell size={16} color={C.success} /> : <BellOff size={16} />}
              <span style={{ fontSize: 10, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {pushEnabled ? 'Notif. ON' : 'Notif. OFF'}
              </span>
            </button>
          )}
          <button onClick={onLogout} className="flex items-center gap-1" style={{ background: 'none', border: 'none', color: C.muted, fontSize: 11, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>
            <LogOut size={14} /> Sair
          </button>
          <button onClick={() => setShowDataChange(true)} title="Solicitar alteração de dados"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, display: 'flex', alignItems: 'center' }}>
            <Settings2 size={15} />
          </button>
        </div>
      </div>

      {canSwitchUnit ? (
        <div className="zc-unitpicker zc-hdr-units flex gap-2">
          {/* "Todas" existia no modelo (unitId nulo = visão consolidada) mas não
              tinha botão: uma vez escolhida uma loja, não havia como voltar à
              visão geral. */}
          <button
            onClick={() => onSelectUnit(null)}
            className="flex-1 py-2"
            aria-pressed={allSelected}
            style={{
              borderRadius: 6, fontSize: 14, fontWeight: W.semibold,
              background: allSelected ? C.ink : 'white',
              color: allSelected ? C.bg : C.ink,
              border: `1.5px solid ${C.ink}`,
            }}
          >
            Todas
          </button>
          {unitList.map(u => (
            <button
              key={u.id} onClick={() => onSelectUnit(u.id)}
              className="flex-1 py-2"
              style={{
                borderRadius: 6, fontSize: 14, fontWeight: W.semibold,
                background: !allSelected && u.id === unit.id ? u.color : 'white',
                color: !allSelected && u.id === unit.id ? C.bg : u.color,
                border: `1.5px solid ${u.color}`,
              }}
            >
              {u.name}
            </button>
          ))}
        </div>
      ) : (
        <div className="zc-hdr-units flex items-center gap-2 py-2 px-3" style={{ borderRadius: 6, background: unit.color, color: C.bg }}>
          <Store size={16} />
          <span style={{ fontSize: 14, fontWeight: W.semibold }}>{unit.name}</span>
        </div>
      )}
      </div>
    </header>
  );
}

/**
 * Por que o push pode não estar disponível — e o que o usuário faz a respeito.
 *
 * Separado do componente porque o auto-pedido no login (que também falhava em
 * silêncio) precisa da mesma leitura, e duas cópias divergiriam na primeira
 * mudança de regra da Apple.
 */
function pushDiagnosis() {
  if (typeof window === 'undefined') return { blocked: true, message: '', failMessage: '' };
  const ua = navigator.userAgent || '';
  const isIOS = /iphone|ipad|ipod/i.test(ua)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia?.('(display-mode: standalone)')?.matches
    || window.navigator.standalone === true;
  const instalar = 'No iPhone, as notificações só funcionam com o app instalado: toque em Compartilhar e depois em "Adicionar à Tela de Início".';

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return {
      blocked: true,
      supported: false,
      message: isIOS && !standalone ? instalar : 'Este navegador não suporta notificações.',
      failMessage: '',
    };
  }
  if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
    return {
      blocked: true,
      supported: true,
      message: 'As notificações estão bloqueadas para este site nos ajustes do navegador.',
      failMessage: '',
    };
  }
  return {
    blocked: false,
    supported: true,
    message: '',
    failMessage: isIOS && !standalone ? instalar : 'Não foi possível ativar as notificações agora.',
  };
}

function BottomNav({ tab, setTab, accent, allowedTabs, jitSignal = false, idSignal = false }) {
  const ALL_ITEMS = BOTTOM_NAV_ORDER.map(id => NAV_ITEMS.find(it => it.id === id)).filter(Boolean);
  const items = ALL_ITEMS.filter(it => allowedTabs.includes(it.id));
  if (items.length <= 1) return null;
  return (
    <nav className="zc-bottomnav sticky bottom-0 flex" aria-label="Navegação principal" style={{
      background: 'white',
      borderTop: `1px solid ${C.border}`,
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    }}>
      {items.map(it => {
        const Icon = it.icon;
        const active = tab === it.id;
        return (
          <button
            key={it.id} onClick={() => setTab(it.id)}
            aria-current={active ? 'page' : undefined}
            aria-label={(it.id === 'painel' && jitSignal) || (it.id === 'id' && idSignal) ? `${it.label}, há novidades` : undefined}
            className="flex-1 flex flex-col items-center gap-1"
            style={{ background: 'none', border: 'none', padding: '10px 4px 12px', minHeight: 56 }}
          >
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              <Icon size={22} color={active ? accent : C.mutedLight} />
              {((it.id === 'painel' && jitSignal) || (it.id === 'id' && idSignal)) && (
                <span aria-hidden="true" style={{
                  position: 'absolute', top: -1, right: -3, width: 8, height: 8,
                  borderRadius: R.pill, background: C.warning, border: '1.5px solid white',
                }} />
              )}
            </span>
                        <span style={{ fontSize: T.label, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.06em', color: active ? accent : C.mutedLight, whiteSpace: 'nowrap' }}>
              {it.short || it.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function LoadingScreen() {
  return (
    <div className="flex items-center justify-center" style={{ minHeight: '100vh', background: C.bg }}>
      <p className="font-display" style={{ color: C.muted, fontWeight: W.semibold, fontSize: 14, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        Carregando…
      </p>
    </div>
  );
}

function LoginScreen({ users: initialUsers, onLogin, company: initialCompany }) {
  const [selectedId, setSelectedId] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Use tenant users when available, fallback to initialUsers
  const users = initialUsers || [];
  const selected = users.find(u => u.id === selectedId) || null;

  const tryLogin = async value => {
    if (value.length !== 4 || !selected) return;
    setLoading(true);
    setError('');
    try {
      const { validatePin } = await import('../../lib/sync');
      const result = await validatePin(selected.id, value);
      if (result.ok && result.token) {
        const { setSessionToken, persistSession } = await import('../../lib/supabase');
        setSessionToken(result.token);
        // Guarda a sessão no aparelho: reload (ou o sistema matando a aba do
        // PWA) não pode exigir novo PIN — offline isso trancaria o usuário.
        persistSession(result.token, result.user);
        onLogin(result.user);
      } else if (result.reason === 'suspended') {
        // A rota recusa o token para suspensos; a checagem não é mais do cliente.
        setError('Acesso suspenso. Entre em contato com a gestão.');
        setPin('');
      } else if (result.reason === 'rate_limited') {
        setError('Muitas tentativas. Aguarde 10 minutos.');
        setPin('');
      } else if (result.reason === 'wrong_pin') {
        setError('PIN incorreto. Tente novamente.');
        setPin('');
      } else if (result.reason === 'network_error') {
        setError('Sem conexão. Verifique sua internet.');
        setPin('');
      } else if (result.reason === 'server_misconfigured' || (result.ok && !result.token)) {
        setError('Serviço indisponível. Avise a gestão.');
        setPin('');
      } else {
        setError('Usuário não encontrado.');
        setPin('');
      }
    } catch (e) {
      setError('Erro inesperado. Tente novamente.');
      setPin('');
    }
    setLoading(false);
  };

  return (
    <div className="flex flex-col" style={{ minHeight: '100vh', background: C.bg, color: C.ink, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`
        .font-display { font-family: ui-sans-serif, system-ui, sans-serif; font-weight: 800; }
        .font-mono-ibr { font-family: ui-monospace, 'SF Mono', 'Roboto Mono', monospace; }
        * { box-sizing: border-box; }
        input, textarea, button, select { font-family: inherit; }
      `}</style>

      {/* Cabeçalho — SEMPRE o logo do ZCheck (padrão do produto, 18/07). O logo
          da empresa, quando existir, aparece acima do seletor de usuário. */}
      <div style={{ width: '100%', height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'white', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <img src="/zcheck-logo.png" alt="ZCheck" style={{ maxHeight: 44, maxWidth: 180, width: 'auto', objectFit: 'contain' }} />
      </div>

      <div className="flex flex-col items-center" style={{ flex: 1, justifyContent: 'center', padding: '24px 24px 80px' }}>

        <div className="w-full" style={{ maxWidth: 320 }}>
          {companyLogoSrc(initialCompany) !== '/zcheck-logo.png' && (
            <div className="flex justify-center" style={{ marginBottom: 24 }}>
              <img src={companyLogoSrc(initialCompany)} alt={initialCompany?.name || 'Logo da empresa'}
                style={{ maxHeight: 72, maxWidth: 220, width: 'auto', objectFit: 'contain' }} />
            </div>
          )}
          <Eyebrow>Usuário</Eyebrow>
          <select
            value={selectedId}
            onChange={e => { setSelectedId(e.target.value); setPin(''); setError(''); }}
            className="w-full mt-1"
            style={{ fontSize: 14, fontWeight: W.semibold, color: C.ink, background: 'white', padding: '12px 10px',
              border: `1.5px solid ${C.border}`, borderRadius: 8, outline: 'none' }}
          >
            <option value="">Selecione…</option>
            {users.filter(u => !u.suspended).map(u => (
              <option key={u.id} value={u.id}>{truncName(u.name, 30)}</option>
            ))}
          </select>

          {selected && (
            <div className="flex flex-col items-center mt-6">
              <Eyebrow>PIN de acesso</Eyebrow>
              <input
                type="tel" inputMode="numeric" autoFocus maxLength={4}
                value={pin}
                onChange={e => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 4);
                  setPin(v); setError('');
                  if (v.length === 4) tryLogin(v);
                }}
                disabled={loading}
                className="text-center mt-1"
                style={{ width: 160, fontSize: 28, fontWeight: W.bold, letterSpacing: '0.5em', padding: '12px 0',
                  background: 'white', border: `1.5px solid ${error ? C.critical : C.border}`, borderRadius: 8, outline: 'none', color: C.ink }}
                placeholder="••••"
              />
              {loading && <p style={{ fontSize: 12, fontWeight: W.semibold, color: C.muted, marginTop: 8 }}>Verificando…</p>}
              {error && <p style={{ fontSize: 12, fontWeight: W.semibold, color: C.critical, marginTop: 8 }}>{error}</p>}
            </div>
          )}
        </div>

        {/* Links */}
        <div style={{ marginTop: 32, textAlign: 'center' }}>
          <p style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>Não tem cadastro?</p>
          <a href="/cadastro"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: W.semibold,
              color: '#063C5C', padding: '10px 20px', borderRadius: 8, border: '1.5px solid #E2EAF0',
              background: 'white', textDecoration: 'none' }}>
            Solicitar acesso →
          </a>
          <div style={{ marginTop: 12 }}>
            <a href="/cadastro?status=1"
              style={{ fontSize: 12, fontWeight: W.semibold, color: C.muted, textDecoration: 'underline' }}>
              Verificar status de solicitação
            </a>
          </div>
          <div style={{ marginTop: 12 }}>
            <a href="/ajuda"
              style={{ fontSize: 12, fontWeight: W.semibold, color: C.muted, textDecoration: 'underline' }}>
              Central de Ajuda
            </a>
          </div>
        </div>

        <InstallPrompt />
      </div>
    </div>
  );
}


function InstallPrompt() {
  const [installEvent, setInstallEvent] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  const [isAndroid, setIsAndroid] = useState(false);

  useEffect(() => {
    // Detecta iOS
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setIsIos(ios);
    setIsAndroid(/android/i.test(navigator.userAgent));
    // Detecta se já está instalado como PWA
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
    setIsStandalone(standalone);
    // Android: captura o evento beforeinstallprompt
    const handler = (e) => {
      e.preventDefault();
      setInstallEvent(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => {
      setInstalled(true);
      track('pwa_installed', { source: 'app' });
    });
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // Já está instalado ou rodando como PWA — não mostra nada
  if (isStandalone || installed) return null;

  const handleInstall = async () => {
    if (!installEvent) return;
    installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    setInstallEvent(null);
  };

  // Android com prompt disponível
  if (installEvent) return (
    <div style={{ marginTop: 20, textAlign: 'center' }}>
      <button
        onClick={handleInstall}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          fontSize: 13, fontWeight: W.semibold, color: 'white',
          padding: '10px 20px', borderRadius: 8, border: 'none',
          background: '#063C5C', cursor: 'pointer',
        }}
      >
        <Smartphone size={15} aria-hidden /> Instalar app na tela inicial
      </button>
    </div>
  );

  // iOS — mostra guia
  if (isIos) return (
    <div style={{ marginTop: 20, textAlign: 'center' }}>
      <button
        onClick={() => setShowIosGuide(v => !v)}
        style={{
          fontSize: 12, fontWeight: W.semibold, color: C.muted,
          background: 'none', border: 'none', cursor: 'pointer',
          textDecoration: 'underline',
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}
      >
        <Smartphone size={13} aria-hidden /> Adicionar à tela inicial
      </button>
      {showIosGuide && (
        <div style={{
          marginTop: 10, padding: '12px 16px', borderRadius: 10,
          background: 'white', border: '1.5px solid #E2EAF0',
          textAlign: 'left', maxWidth: 280, margin: '10px auto 0',
        }}>
          <p style={{ fontSize: 12, fontWeight: W.semibold, color: '#063C5C', marginBottom: 8 }}>
            Como instalar no iPhone / iPad:
          </p>
          <ol style={{ fontSize: 12, color: '#555', lineHeight: 1.8, paddingLeft: 16, margin: 0 }}>
            {/* O glifo aqui era ⎋ (U+238B), que é o símbolo da tecla ESC — outro
                desenho, outro significado. Mandava procurar na tela um botão que
                não existe. `Share` do lucide é a caixa com seta para cima, que é
                o que o Safari realmente mostra. */}
            <li>
              Toque no botão <strong>Compartilhar</strong>{' '}
              <Share size={13} aria-label="ícone Compartilhar" style={{ display: 'inline', verticalAlign: '-2px' }} />
              {' '}no Safari
            </li>
            <li>Role para baixo e toque em <strong>"Adicionar à Tela de Início"</strong></li>
            <li>Confirme tocando em <strong>"Adicionar"</strong></li>
          </ol>
          <p style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>
            O app aparecerá na sua tela inicial como qualquer outro app.
          </p>
        </div>
      )}
    </div>
  );

  // Android SEM o prompt nativo (Firefox, ou o evento disparou antes do mount):
  // guia manual, para nunca ficar sem caminho de instalação.
  if (isAndroid) return (
    <div style={{ marginTop: 20, textAlign: 'center' }}>
      <button
        onClick={() => setShowIosGuide(v => !v)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: W.semibold, color: C.muted, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
      >
        <Smartphone size={13} aria-hidden /> Adicionar à tela inicial
      </button>
      {showIosGuide && (
        <div style={{ marginTop: 10, padding: '12px 16px', borderRadius: 10, background: 'white', border: '1.5px solid #E2EAF0', textAlign: 'left', maxWidth: 280, margin: '10px auto 0' }}>
          <p style={{ fontSize: 12, fontWeight: W.semibold, color: '#063C5C', marginBottom: 8 }}>Como instalar no Android:</p>
          <ol style={{ fontSize: 12, color: '#555', lineHeight: 1.8, paddingLeft: 16, margin: 0 }}>
            <li>Toque no menu <strong>⋮</strong> do navegador</li>
            <li>Toque em <strong>"Instalar app"</strong> ou <strong>"Adicionar à tela inicial"</strong></li>
            <li>Confirme tocando em <strong>"Instalar"</strong></li>
          </ol>
          <p style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>
            O app aparecerá na sua tela inicial como qualquer outro app.
          </p>
        </div>
      )}
    </div>
  );

  return null;
}

/* ── Onboarding guiado da empresa (primeiro acesso da gestão) ── */
// Empresa recém-provisionada não tem nenhum checklist: este fluxo dá as
// boas-vindas, deixa escolher o segmento e cria as cópias da biblioteca
// mapeadas para as lojas/setores da própria empresa — resolve a página em
// branco sem exigir migração no provisionamento.
const normalizeName = s => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

// Mesmos ícones que a landing usa para os segmentos (app/page.js), para que
// quem escolhe "Academia" no site reencontre o mesmo desenho no onboarding.
const VERTICAL_ICON = {
  'food-service': UtensilsCrossed,
  hotel: BedDouble,
  eventos: Tent,
  varejo: Store,
  academia: Dumbbell,
  petshop: PawPrint,
};

// Deduz o segmento comparando os setores da empresa com as áreas da biblioteca.
function guessVertical(units) {
  const names = new Set(units.flatMap(u => (u.sectors || []).map(normalizeName)));
  let best = null, bestScore = 0;
  LIBRARY_VERTICALS.forEach(v => {
    const areas = [...new Set(LIBRARY_TEMPLATES.filter(t => t.vertical === v.id).map(t => normalizeName(t.area)))];
    const score = areas.filter(a => names.has(a)).length;
    if (score > bestScore) { best = v.id; bestScore = score; }
  });
  return best;
}

// Para cada loja da empresa, mapeia cada modelo do segmento para o setor de
// nome equivalente; sem equivalente, cai no primeiro setor da loja.
function libraryPlanForCompany(vertical, units) {
  const models = LIBRARY_TEMPLATES.filter(t => t.vertical === vertical);
  const plan = [];
  units.forEach(u => {
    const sectors = u.sectors || [];
    models.forEach(m => {
      const sector =
        sectors.find(s => normalizeName(s) === normalizeName(m.area)) ||
        sectors.find(s => normalizeName(s).includes(normalizeName(m.area)) || normalizeName(m.area).includes(normalizeName(s))) ||
        sectors[0] || m.area;
      plan.push({ model: m, unit: u, sector });
    });
  });
  return plan;
}

function CompanyOnboarding({ company, units, currentUser, onCreateTemplates, onClose, onGoToTab, onStartTour }) {
  const [step, setStep] = useState(0); // 0 segmento · 1 revisão · 2 pronto
  const [vertical, setVertical] = useState(() => guessVertical(units));
  const [creating, setCreating] = useState(false);
  const accent = units[0]?.color || C.ink;

  useEffect(() => { track('onboarding_shown', { source: 'onboarding' }); }, []);

  const plan = vertical ? libraryPlanForCompany(vertical, units) : [];

  const createAll = async () => {
    if (creating || plan.length === 0) return;
    setCreating(true);
    const created = plan.map(({ model: m, unit: u, sector }) => ({
      id: uid(),
      unitId: u.id,
      sector,
      shift: m.momento === 'Abertura' ? 'Manhã' : m.momento === 'Fechamento' ? 'Tarde' : ['Manhã', 'Tarde'],
      name: `${m.area} — ${m.momento}`,
      deadline: m.deadline || null,
      items: (m.items || []).map(i => ({
        id: uid(), text: i.text, critical: !!i.critical,
        required: !!i.required, photoRequired: !!i.photoRequired,
      })),
    }));
    await onCreateTemplates(created);
    created.forEach(t => track('template_adopted', { source: 'onboarding', unitId: t.unitId, metadata: { vertical, name: t.name } }));
    track('onboarding_completed', { source: 'onboarding', metadata: { vertical, templates: created.length } });
    setCreating(false);
    setStep(2);
  };

  const skip = () => {
    track('onboarding_skipped', { source: 'onboarding' });
    onClose();
    onGoToTab('gerenciar');
  };

  const Btn = ({ children, onClick, primary, disabled }) => (
    <button onClick={onClick} disabled={disabled}
      style={{ width: '100%', padding: '14px 0', borderRadius: 12, fontWeight: W.semibold, fontSize: 15, cursor: disabled ? 'default' : 'pointer',
        background: primary ? (disabled ? C.muted : accent) : 'white',
        color: primary ? 'white' : C.muted,
        border: primary ? 'none' : `1px solid ${C.border}` }}>
      {children}
    </button>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(11,60,92,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 400, background: C.bg, borderRadius: 20, overflow: 'hidden', boxShadow: '0 8px 40px rgba(0,0,0,0.4)', maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ background: accent, padding: '22px 24px 18px', textAlign: 'center' }}>
          <p style={{ fontSize: 11, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.75)', marginBottom: 4 }}>
            Bem-vindo ao ZCheck
          </p>
          <p style={{ fontSize: 20, fontWeight: W.bold, color: 'white' }}>{company?.name || 'Sua empresa'}</p>
        </div>

        <div style={{ padding: '20px 22px' }}>
          {step === 0 && (
            <>
              <p style={{ fontSize: 14.5, color: C.ink, lineHeight: 1.6, marginBottom: 6, fontWeight: W.semibold }}>
                Vamos deixar sua operação pronta em 1 minuto.
              </p>
              <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 16 }}>
                Escolha o seu segmento para carregar os checklists prontos da nossa base — você pode ajustar tudo depois em Gerenciar.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
                {LIBRARY_VERTICALS.map(v => {
                  const active = vertical === v.id;
                  const count = LIBRARY_TEMPLATES.filter(t => t.vertical === v.id).length;
                  const empty = count === 0; // setor na taxonomia, modelos ainda em curadoria
                  const VIcon = VERTICAL_ICON[v.id] || ClipboardList;
                  return (
                    <button key={v.id} onClick={() => !empty && setVertical(v.id)} disabled={empty}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, cursor: empty ? 'default' : 'pointer', textAlign: 'left',
                        opacity: empty ? 0.55 : 1,
                        background: active ? `${accent}12` : 'white',
                        border: `1.5px solid ${active ? accent : C.border}` }}>
                      <VIcon size={20} color={active ? accent : C.muted} strokeWidth={1.75} aria-hidden style={{ flexShrink: 0 }} />
                      <span style={{ flex: 1 }}>
                        <span style={{ display: 'block', fontSize: 14, fontWeight: W.semibold, color: C.ink }}>{v.label}</span>
                        <span style={{ display: 'block', fontSize: 11.5, color: C.muted }}>
                          {empty ? 'Modelos em breve — comece do zero' : `${count} checklists prontos${v.hint ? ` · ${v.hint}` : ''}`}
                        </span>
                      </span>
                      {active && <CheckCircle2 size={18} color={accent} />}
                    </button>
                  );
                })}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Btn primary disabled={!vertical} onClick={() => setStep(1)}>Continuar →</Btn>
                <Btn onClick={skip}>Começar do zero em Gerenciar</Btn>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <p style={{ fontSize: 14.5, color: C.ink, lineHeight: 1.6, marginBottom: 6, fontWeight: W.semibold }}>
                Estes checklists serão criados para você:
              </p>
              <p style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5, marginBottom: 14 }}>
                Cada um vira uma cópia sua — edite itens, prazos e orientações quando quiser.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
                {plan.map(({ model: m, unit: u, sector }, i) => (
                  <div key={i} style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px' }}>
                    <p style={{ fontSize: 13.5, fontWeight: W.semibold, color: C.ink }}>{m.area} — {m.momento}</p>
                    <p style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>
                      {u.name} · setor {sector} · {(m.items || []).length} itens
                      {(m.items || []).some(x => x.critical) ? ` · ${(m.items || []).filter(x => x.critical).length} críticos` : ''}
                    </p>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Btn primary disabled={creating} onClick={createAll}>
                  {creating ? 'Criando…' : `Criar ${plan.length} checklists`}
                </Btn>
                <Btn onClick={() => setStep(0)}>← Trocar segmento</Btn>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <CheckCircle2 size={44} color={C.success} strokeWidth={1.5} aria-hidden style={{ margin: '0 auto 10px' }} />
                <p style={{ fontSize: 16, fontWeight: W.semibold, color: C.ink }}>Checklists criados!</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
                {[
                  // Os ícones são os mesmos das abas correspondentes na navegação
                  // (NAV_ITEMS): a linha aponta para onde a ação acontece.
                  { Icon: Settings2,      text: 'Ajuste itens, fotos e orientações em Gerenciar.' },
                  { Icon: Users,          text: 'Cadastre a equipe em Usuários — cada um com seu PIN.' },
                  { Icon: ClipboardCheck, text: 'Execute o primeiro checklist na aba Executar.' },
                  { Icon: BarChart3,      text: 'Os Relatórios e a produtividade aparecem conforme a equipe executa.' },
                ].map(({ Icon, text }, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'white', border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px' }}>
                    <Icon size={16} color={C.muted} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
                    <p style={{ fontSize: 13, color: C.ink, lineHeight: 1.5 }}>{text}</p>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Btn primary onClick={() => { onClose(); onStartTour(); }}>Fazer o tour guiado (2 min) →</Btn>
                <Btn onClick={() => { onClose(); onGoToTab('executar'); }}>Explorar sozinho</Btn>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Tour guiado do gestor ── */
// Percorre as abas REAIS do app, uma a uma: o cartão fica ancorado embaixo,
// a tela de verdade aparece atrás (já com os checklists criados no onboarding)
// e cada passo traz uma orientação prática de primeiro uso. Diferente de um
// modal estático: o gestor vê exatamente onde cada coisa está.
// O ícone de cada passo NÃO é declarado aqui: sai de NAV_ITEMS pelo `tab`
// (ver `tourIcon`). Assim o desenho do passo é sempre o mesmo que o usuário vê
// na barra de navegação enquanto o tour a percorre.
const GESTOR_TOUR_STEPS = [
  {
    tab: 'executar', title: 'Executar — onde a equipe trabalha',
    desc: 'Os checklists do dia, por setor e turno. Cada tarefa pode ter orientação, foto de referência, POP e vídeo no botão "Ver mais". Itens críticos ganham destaque; alguns exigem foto.',
    dica: 'Toque num checklist e execute você mesmo — é o jeito mais rápido de entender o que a equipe vai ver.',
  },
  {
    tab: 'painel', title: 'Painel — o dia em tempo real',
    desc: 'Score do dia, o que está pendente, atrasado e concluído — e o comparativo entre lojas quando houver mais de uma.',
    dica: 'Abra o Painel todo início de turno: é a foto instantânea da operação.',
  },
  {
    tab: 'painel', title: 'Painel — a análise, no mesmo lugar',
    desc: 'Abaixo do dia, o Painel abre em período: desempenho por colaborador e por setor, produtividade (100 = média da empresa) e exportação em PDF ou CSV — tudo pela faixa "Período" no topo da seção.',
    dica: 'Os dados aparecem conforme a equipe executa. Use o PDF nas reuniões semanais.',
  },
  {
    tab: 'gerenciar', title: 'Gerenciar — seus checklists',
    desc: 'Edite os checklists criados: itens, prazos, dias da semana, críticos e foto obrigatória. Em cada item, anexe orientação, fotos, POP e vídeo — a tarefa vira treinamento.',
    dica: 'Revise os checklists prontos e ajuste ao seu padrão — eles são cópias suas, sem medo de editar.',
  },
  {
    tab: 'usuarios', title: 'Usuários — cadastre a equipe',
    desc: 'Cada pessoa entra com o próprio nome + PIN de 4 dígitos. Solicitações de acesso feitas pelo app chegam aqui para você aprovar.',
    dica: 'Primeiro passo recomendado: cadastre 2–3 colaboradores e peça para executarem um checklist hoje.',
  },
  {
    tab: 'equipe', title: 'Equipe — perfis e reconhecimento',
    desc: 'O perfil de cada colaborador: nível, tarefas executadas, sequência de dias e score de produtividade. Daqui você envia reconhecimentos.',
    dica: 'Reconheça um bom resultado por semana — engajamento é o que sustenta a rotina.',
  },
];

function GestorTour({ allowedTabs, accent, onGoToTab, onClose }) {
  const steps = GESTOR_TOUR_STEPS.filter(s => allowedTabs.includes(s.tab));
  const [i, setI] = useState(0);
  const step = steps[i];
  const isLast = i === steps.length - 1;

  useEffect(() => { track('gestor_tour_started', { source: 'onboarding' }); }, []);
  useEffect(() => { if (step) onGoToTab(step.tab); }, [i]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!step) return null;

  // Ícone do passo = ícone da aba que ele está apresentando (fonte: NAV_ITEMS).
  const StepIcon = NAV_ITEMS.find(it => it.id === step.tab)?.icon || ClipboardList;

  const finish = done => {
    track(done ? 'gestor_tour_completed' : 'gestor_tour_skipped', { source: 'onboarding', metadata: { step: i + 1, of: steps.length } });
    onClose();
  };

  return (
    <div className="zc-overlay" style={{ position: 'fixed', left: 0, right: 0, bottom: 'calc(var(--zc-nav-h) + 8px + env(safe-area-inset-bottom, 0px))', zIndex: 150, padding: '0 12px', pointerEvents: 'none' }}>
      <div style={{ maxWidth: 480, margin: '0 auto', background: 'white', borderRadius: 16, border: `2px solid ${accent}`, boxShadow: '0 8px 32px rgba(6,60,92,0.35)', padding: '14px 16px', pointerEvents: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <p style={{ fontSize: 10.5, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.1em', color: accent }}>
            Tour guiado · {i + 1} de {steps.length}
          </p>
          <button onClick={() => finish(false)} style={{ background: 'none', border: 'none', fontSize: 11.5, fontWeight: W.semibold, color: C.muted, cursor: 'pointer', padding: '4px 6px', margin: '-4px -6px' }}>
            Pular tour
          </button>
        </div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
          {steps.map((_, x) => (
            <div key={x} style={{ flex: 1, height: 3, borderRadius: 999, background: x <= i ? accent : C.border }} />
          ))}
        </div>
        <p style={{ fontSize: 15, fontWeight: W.semibold, color: C.ink, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 7 }}>
          <StepIcon size={17} color={accent} aria-hidden style={{ flexShrink: 0 }} /> {step.title}
        </p>
        <p style={{ fontSize: 12.5, color: C.ink, lineHeight: 1.55, marginBottom: 8 }}>{step.desc}</p>
        <p style={{ fontSize: 12, color: accent, lineHeight: 1.5, fontWeight: W.semibold, background: `${accent}10`, borderRadius: 8, padding: '8px 10px', marginBottom: 12, display: 'flex', alignItems: 'flex-start', gap: 7 }}>
          <Lightbulb size={14} aria-label="Dica" style={{ flexShrink: 0, marginTop: 1 }} /> {step.dica}
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          {i > 0 && (
            <button onClick={() => setI(i - 1)}
              style={{ flex: 1, padding: '11px 0', borderRadius: 10, background: 'white', color: C.muted, border: `1px solid ${C.border}`, fontWeight: W.semibold, fontSize: 13.5, cursor: 'pointer' }}>
              ← Voltar
            </button>
          )}
          <button onClick={() => (isLast ? finish(true) : setI(i + 1))}
            style={{ flex: 2, padding: '11px 0', borderRadius: 10, background: accent, color: 'white', border: 'none', fontWeight: W.semibold, fontSize: 13.5, cursor: 'pointer' }}>
            {isLast ? 'Concluir tour' : 'Próximo →'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── WelcomeScreen ── */
function WelcomeScreen({ role, onClose }) {
  const isLider = role === 'lideranca';
  const [step, setStep] = useState(0);

  const colaboradorSteps = [
    { Icon: KeyRound,       title: 'Faça login', desc: 'Selecione seu nome na lista e digite seu PIN de 4 dígitos.' },
    { Icon: ClipboardCheck, title: 'Abra Executar', desc: 'Na aba Executar, veja os checklists do seu setor e turno de hoje.' },
    { Icon: CheckCircle2,   title: 'Marque os itens', desc: 'Toque em cada item para marcar como concluído. Itens críticos aparecem destacados — priorize-os.' },
    { Icon: Camera,         title: 'Tire fotos', desc: 'Itens com câmera exigem foto como comprovação. Toque no ícone da câmera e registre.' },
    { Icon: CheckCheck,     title: 'Conclua o checklist', desc: 'Quando todos os itens estiverem marcados, toque em "Concluir" para registrar.' },
    { Icon: LayoutGrid,     title: 'Veja seu Painel', desc: 'Na aba Painel, acompanhe seu score e compare com a equipe.' },
  ];

  const liderSteps = [
    { Icon: BarChart3,      title: 'Relatórios', desc: 'Acesse a aba Relatórios para ver o desempenho da equipe por período, setor e colaborador. Exporte em PDF ou CSV.' },
    { Icon: LayoutGrid,     title: 'Painel', desc: 'Acompanhe o score diário, ranking da equipe e o comparativo entre lojas com tendência dos últimos 7 dias.' },
    { Icon: ClipboardCheck, title: 'Executar', desc: 'Você também pode executar checklists e ver o progresso de todos os setores da sua loja.' },
    { Icon: Calendar,       title: 'Filtros de período', desc: 'Nos relatórios, filtre por dia, semana, mês completo ou período personalizado.' },
    { Icon: Users,          title: 'Ranking de equipe', desc: 'Veja quem está se destacando no Painel — ranking por % de realização nos últimos 7 dias.' },
    { Icon: Settings2,      title: 'Solicitar alterações', desc: 'Use a engrenagem no cabeçalho para solicitar alteração dos seus dados cadastrais.' },
  ];

  const steps = isLider ? liderSteps : colaboradorSteps;
  const isLast = step === steps.length - 1;

  const tips = isLider ? [
    { Icon: WifiOff,    text: 'Funciona offline. Sincroniza quando voltar a internet.' },
    { Icon: Bell,       text: 'Ative as notificações para alertas de checklists atrasados.' },
    { Icon: Smartphone, text: 'Adicione à tela inicial para acesso rápido como app.' },
  ] : [
    { Icon: WifiOff,       text: 'Funciona offline. Sincroniza quando voltar a internet.' },
    { Icon: Bell,          text: 'Ative as notificações para receber alertas de atraso.' },
    { Icon: Smartphone,    text: 'Adicione à tela inicial para acesso rápido como app.' },
    { Icon: AlertTriangle, text: 'Não compartilhe seu PIN com ninguém.' },
  ];

  const accentColor = isLider ? '#35577A' : '#2F6F5E';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(11,60,92,0.92)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{
        width: '100%', maxWidth: 380, background: C.bg,
        borderRadius: 20, overflow: 'hidden',
        boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{ background: accentColor, padding: '20px 24px 16px', textAlign: 'center' }}>
          <p style={{ fontSize: 11, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.7)', marginBottom: 4 }}>
            Bem-vindo ao ZCheck
          </p>
          <p style={{ fontSize: 20, fontWeight: W.bold, color: 'white' }}>
            {isLider ? 'Guia de Liderança' : 'Guia do Colaborador'}
          </p>
        </div>

        {/* Step indicator */}
        <div style={{ display: 'flex', gap: 4, justifyContent: 'center', padding: '12px 24px 0' }}>
          {steps.map((_, i) => (
            <div key={i} style={{
              flex: 1, height: 3, borderRadius: 999,
              background: i <= step ? accentColor : C.border,
              transition: 'background 0.3s',
            }} />
          ))}
        </div>

        {/* Step content */}
        <div style={{ padding: '20px 24px' }}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            {(() => { const S = steps[step].Icon; return (
              <S size={40} color={accentColor} strokeWidth={1.5} aria-hidden style={{ margin: '0 auto 12px' }} />
            ); })()}
            <p style={{ fontSize: 11, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.1em', color: accentColor, marginBottom: 6 }}>
              Passo {step + 1} de {steps.length}
            </p>
            <p className="font-display" style={{ fontSize: 'calc(20px * var(--zc-t-scale))', fontWeight: W.bold, color: C.ink, marginBottom: 8 }}>
              {steps[step].title}
            </p>
            <p style={{ fontSize: 14, color: '#555', lineHeight: 1.6 }}>
              {steps[step].desc}
            </p>
          </div>

          {/* Tips on last step */}
          {isLast && (
            <div style={{ background: 'white', borderRadius: 12, padding: 14, marginBottom: 8, border: `1px solid ${C.border}` }}>
              <p style={{ fontSize: 10, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.muted, marginBottom: 10 }}>
                Dicas importantes
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {tips.map(({ Icon, text }, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <Icon size={15} color={C.muted} aria-hidden style={{ flexShrink: 0, marginTop: 1 }} />
                    <p style={{ fontSize: 12, color: '#555', lineHeight: 1.4 }}>{text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Navigation */}
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            {step > 0 && (
              <button onClick={() => setStep(s => s - 1)}
                style={{ flex: 1, padding: '12px', borderRadius: 10, border: `1.5px solid ${C.border}`, background: 'white', fontWeight: W.semibold, fontSize: 13, color: C.ink, cursor: 'pointer' }}>
                ← Anterior
              </button>
            )}
            <button
              onClick={() => isLast ? onClose() : setStep(s => s + 1)}
              style={{ flex: 2, padding: '12px', borderRadius: 10, border: 'none', background: accentColor, color: 'white', fontWeight: W.semibold, fontSize: 14, cursor: 'pointer' }}
            >
              {isLast ? 'Começar!' : 'Próximo →'}
            </button>
          </div>

          {!isLast && (
            <button onClick={onClose}
              style={{ width: '100%', marginTop: 10, padding: '8px', background: 'none', border: 'none', fontSize: 12, color: C.muted, cursor: 'pointer', fontWeight: W.semibold }}>
              Pular introdução
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  componentDidCatch(e, info) { console.error('[ErrorBoundary]', e.message, info?.componentStack?.slice(0, 200)); }
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: '100vh', background: '#F7F9FB', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'system-ui' }}>
          <AlertTriangle size={34} color="#063C5C" strokeWidth={1.5} aria-hidden style={{ marginBottom: 14 }} />
          <p style={{ fontSize: 18, fontWeight: W.semibold, color: '#063C5C', marginBottom: 8 }}>Algo deu errado</p>
          <p style={{ fontSize: 12, color: C.muted, textAlign: 'center', maxWidth: 340, marginBottom: 8, fontFamily: 'monospace', background: '#fff', padding: 8, borderRadius: 6 }}>
            {this.state.error?.message}
          </p>
          <button onClick={() => window.location.reload()}
            style={{ padding: '12px 24px', borderRadius: 8, background: '#063C5C', color: 'white', border: 'none', fontWeight: W.semibold, cursor: 'pointer' }}>
            Recarregar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}









/**
 * ID Operacional da UNIDADE — o análogo de `computeOperationalProfile`, que faz
 * o mesmo para a pessoa.
 *
 * A diferença que importa: a pessoa não tem "esperado". A unidade tem — dá para
 * saber quantos checklists eram previstos num dia (`countApplicableTemplatesOnDate`,
 * descontando folgas). Por isso ADERÊNCIA é a métrica-mãe da unidade, e não a
 * simples contagem de execuções: uma loja que fez 40 de 40 vale mais que outra
 * que fez 60 de 90.
 *
 * `days` é a janela de análise (30 por padrão).
 */
function computeUnitProfile(completions, templates, closures, unit, days = 30, sector = null) {
  const uid = unit.id;
  const tz = tzOf(unit); // a janela é a dos últimos N dias DELA
  // Uma rodada por checklist/dia: sem isso a loja que reexecutou um checklist
  // aparecia com mais entregas do que o previsto (aderência acima de 100%, aqui
  // sem nem o teto que o índice da liderança tem) e com os ITENS da mesma rodada
  // somados duas vezes na taxa de tarefas e na contagem de evidências.
  const mine = latestPerRound((completions || [])
    .filter(c => c.unitId === uid && (!sector || c.sector === sector)))
    .sort((a, b) => (a.completedAt || '').localeCompare(b.completedAt || ''));

  // Janela de datas, do mais antigo ao mais recente.
  const dates = lastDays(days, null, tz);

  // Aderência: ENTREGAS COMPLETAS ÷ previstos, dia a dia, ignorando folga.
  // Entrega incompleta não conta (decisão de 30/07/2026): submeter com 1 de 8
  // itens contava igual a 8 de 8, e a métrica media se alguém apertou "Concluir",
  // não se o trabalho foi feito. As entregas parciais voltam em `partialChecklists`
  // para a tela poder explicar a diferença em vez de só mostrar o índice menor.
  const completa = completeRoundChecker(templates);
  let expected = 0, doneChecklists = 0, partialChecklists = 0;
  const daily = dates.map(ds => {
    const closed = isUnitClosed(closures, uid, ds);
    const exp = closed ? 0 : countApplicableTemplatesOnDate(templates, sector ? { unitId: uid, sector } : { unitId: uid }, ds);
    const doDia = mine.filter(c => c.date === ds);
    const done = doDia.filter(completa).length;
    expected += exp; doneChecklists += done; partialChecklists += doDia.length - done;
    return { date: ds, expected: exp, done, partial: doDia.length - done, closed, rate: exp ? Math.round((done / exp) * 100) : null };
  });
  const adherence = expected ? Math.round((doneChecklists / expected) * 100) : null;

  // Qualidade da execução: tarefas e críticos.
  let totalItems = 0, doneItems = 0, critTotal = 0, critDone = 0, evidences = 0;
  const operators = new Set();
  mine.forEach(c => {
    if (c.operatorUserId || c.operatorName) operators.add(c.operatorUserId || c.operatorName);
    (c.items || []).forEach(i => {
      totalItems++; if (i.done) doneItems++;
      if (i.critical) { critTotal++; if (i.done) critDone++; }
      if (i.hasPhoto) evidences++;
    });
  });
  const taskRate = totalItems ? Math.round((doneItems / totalItems) * 100) : 0;
  const criticalRate = critTotal ? Math.round((critDone / critTotal) * 100) : null;
  const criticalPending = critTotal - critDone;

  const activeDays = [...new Set(mine.map(c => c.date).filter(Boolean))];
  const streak = currentStreak(new Set(activeDays), tz);
  const bestStreak = longestStreak(activeDays);

  // Evolução por semana (últimas 6 com atividade).
  const wkMap = new Map();
  mine.forEach(c => {
    const wk = weekStartStr(c.date);
    if (!wkMap.has(wk)) wkMap.set(wk, { week: wk, total: 0, done: 0, checklists: 0 });
    const w = wkMap.get(wk); w.checklists++;
    (c.items || []).forEach(i => { w.total++; if (i.done) w.done++; });
  });
  const weekly = [...wkMap.values()]
    .map(w => ({ ...w, rate: w.total ? Math.round((w.done / w.total) * 100) : 0 }))
    .sort((a, b) => a.week.localeCompare(b.week))
    .slice(-6);

  /**
   * Índice operacional — número único que ordena o ranking.
   * Pesos explícitos de propósito: aderência é o que a gestão cobra (fez o que
   * era para fazer), qualidade vem depois, e crítico pesa porque é risco.
   * Se um dia mudar, muda AQUI e o ranking inteiro acompanha.
   */
  const parts = [
    { key: 'aderencia', label: 'Aderência', weight: 0.5, value: adherence },
    { key: 'tarefas', label: 'Tarefas concluídas', weight: 0.3, value: taskRate },
    { key: 'criticos', label: 'Críticos em dia', weight: 0.2, value: criticalRate },
  ];
  const usable = parts.filter(x => x.value != null);
  const wsum = usable.reduce((a, x) => a + x.weight, 0);
  const index = usable.length ? Math.round(usable.reduce((a, x) => a + x.value * x.weight, 0) / wsum) : null;

  // Nível: mesma ideia do colaborador, régua maior — uma loja acumula muito
  // mais checklists que uma pessoa, então 15 por nível não faria sentido.
  const perLevel = 60;
  const level = Math.floor(mine.length / perLevel) + 1;
  const intoLevel = mine.length % perLevel;

  const achievements = [
    { id: 'rotina', title: 'Rotina de pé', desc: '10 checklists concluídos', earned: mine.length >= 10 },
    { id: 'cem', title: 'Cem rodadas', desc: '100 checklists concluídos', earned: mine.length >= 100 },
    { id: 'streak7', title: 'Sete dias', desc: '7 dias seguidos em operação', earned: bestStreak >= 7 },
    { id: 'aderencia90', title: 'Aderência alta', desc: 'Aderência ≥ 90% no período', earned: adherence != null && adherence >= 90 },
    { id: 'criticos95', title: 'Risco sob controle', desc: 'Críticos em dia ≥ 95%', earned: criticalRate != null && criticalRate >= 95 },
    { id: 'semana', title: 'Semana perfeita', desc: 'Uma semana inteira a 100%', earned: weekly.some(w => w.rate === 100 && w.checklists >= 3) },
    { id: 'evidencia', title: 'Prova em dia', desc: '50+ evidências registradas', earned: evidences >= 50 },
    { id: 'equipe', title: 'Time inteiro', desc: '5+ pessoas executando', earned: operators.size >= 5 },
  ];

  return {
    unit, sector, index, parts,
    adherence, taskRate, criticalRate, criticalPending,
    // `checklists` = submissões (o que a loja entregou); `doneChecklists` = as
    // COMPLETAS, que é o numerador da aderência. Quando os dois divergem, a
    // diferença é `partialChecklists` — e é ela que explica um índice mais baixo
    // sem que ninguém tenha deixado de trabalhar.
    checklists: mine.length, doneChecklists, partialChecklists, expected, evidences,
    operators: operators.size,
    streak, bestStreak, activeDays: activeDays.length,
    level, intoLevel, perLevel,
    weekly, daily, achievements,
    recent: mine.slice(-8).reverse(),
    windowDays: days,
  };
}

/**
 * ID Operacional da LIDERANÇA — a terceira régua, ao lado da pessoa
 * (`computeOperationalProfile`) e da loja (`computeUnitProfile`).
 *
 * A diferença de conceito: as outras duas medem quem EXECUTA. Esta mede quem
 * RESPONDE pela execução dos outros. Por isso nenhum componente olha o que o
 * líder fez com as próprias mãos — os três olham o resultado da equipe dele:
 *
 *   No prazo (40%)   — dos checklists com prazo, quantos a equipe entregou
 *                      dentro dele. É o coração do pedido: cobrar horário é
 *                      trabalho de liderança, e o número mostra se funcionou.
 *   Aderência (30%)  — fez-se o que estava previsto, descontadas as folgas.
 *                      Mesma métrica-mãe da loja: entregar no prazo só metade
 *                      do previsto não pode dar nota alta.
 *   Conferidos (30%) — das execuções da equipe, quantas ELE revisou. É a única
 *                      parte que mede um ato do próprio líder, e existe porque
 *                      sem ela "no prazo" e "aderência" premiariam quem tem uma
 *                      equipe boa sem nunca ter olhado um checklist.
 *
 * Escopo: quem tem loja (liderança) responde pela loja dela; quem não tem
 * (gerência, diretoria) responde pela empresa inteira.
 *
 * Duas decisões que mudam o número e por isso ficam explícitas:
 *
 * 1. Conferir a PRÓPRIA execução não conta — nem no numerador nem no
 *    denominador. Autoconferência não é revisão, e sem esta regra o caminho
 *    mais curto para 100% seria executar tudo sozinho e assinar embaixo.
 * 2. O dia de HOJE fica fora do denominador de conferidos. Um checklist
 *    fechado há dez minutos ainda não teve tempo de ser revisado; incluí-lo
 *    faria a nota de todo líder cair toda manhã e subir toda noite, medindo o
 *    relógio em vez do trabalho.
 *
 * Consequência assumida: se duas lideranças dividem a mesma loja, as
 * conferências se dividem entre elas — quem revisou leva. É o comportamento
 * correto para medir esforço individual, mas significa que as duas não podem
 * chegar a 100% ao mesmo tempo.
 */
function computeLeadershipProfile({ completions, templates, closures, units, leader, periodo, today }) {
  // `isUnitClosed` e `countApplicableTemplatesOnDate` assumem array; este cálculo
  // roda num useMemo que dispara antes de templates/closures terminarem de
  // carregar, e um `undefined.some` derrubaria a aba inteira.
  const tpl = templates || [];
  const clo = closures || [];
  const scopeUnits = leader.unitId
    ? (units || []).filter(u => u.id === leader.unitId)
    : (units || []);
  const scopeIds = new Set(scopeUnits.map(u => u.id));

  // Líder preso a uma loja mede pelo relógio dela; quem responde pela empresa
  // toda mede pela primeira do escopo — não existe um dia único para a rede.
  const tz = tzOf(scopeUnits[0]);
  // O período vem pronto do seletor da aba Equipe — o MESMO objeto que o
  // ranking do colaborador usa (`rankingPeriod`). Sem ele, mês corrente.
  const per = periodo || rankingPeriod(RANKING_PERIOD_DEFAULT, tz, completions);
  const dateSet = per.dates;
  const dates = [...dateSet].sort();
  const days = per.days;

  // `teamRaw` guarda as submissões; `team` é uma por rodada. A distinção importa
  // porque as três partes do índice pesam coisas diferentes — ver cada uma abaixo.
  const teamRaw = (completions || []).filter(c => scopeIds.has(c.unitId) && dateSet.has(c.date));
  const team = latestPerRound(teamRaw);

  // ── No prazo (peso 0.4 do índice) ──
  // Pela PRIMEIRA entrega de cada rodada, igual ao J.I.T.: entrega feita no prazo
  // não vira atraso porque alguém reabriu uma tarefa e submeteu de novo horas
  // depois. Sem desduplicar, a mesma rodada entrava duas vezes — uma no prazo e
  // outra fora — e isso derrubava o componente de maior peso da nota do líder.
  let onTimeTotal = 0, onTimeDone = 0;
  earliestPerRound(teamRaw).forEach(c => {
    const ok = completionOnTime(c, tpl, null, units);
    if (ok === null) return;
    onTimeTotal++;
    if (ok) onTimeDone++;
  });
  const onTimeRate = onTimeTotal ? Math.round((onTimeDone / onTimeTotal) * 100) : null;

  // ── Aderência da equipe ──
  // Contagem por (loja, dia) num Map: o caminho ingênuo é um filter dentro de
  // dois loops, que em 3 lojas × 30 dias × 1000 execuções vira 90 mil varreduras
  // a cada render do ranking.
  const doneByUnitDate = new Map();
  // Uma rodada por checklist/dia (reexecução não conta como dois entregues) E só
  // as COMPLETAS: entrega pela metade deixou de contar como entrega em 30/07/2026.
  // O teto de 100 abaixo vira defesa, não a correção principal.
  const completa = completeRoundChecker(tpl);
  team.filter(completa).forEach(c => {
    const k = `${c.unitId}|${c.date}`;
    doneByUnitDate.set(k, (doneByUnitDate.get(k) || 0) + 1);
  });
  const partialChecklists = team.length - team.filter(completa).length;
  let expected = 0, doneChecklists = 0;
  scopeUnits.forEach(u => dates.forEach(ds => {
    if (isUnitClosed(clo, u.id, ds)) return;
    expected += countApplicableTemplatesOnDate(tpl, { unitId: u.id }, ds);
    doneChecklists += doneByUnitDate.get(`${u.id}|${ds}`) || 0;
  }));
  // Teto em 100: reexecução no mesmo dia faz `done > expected`, e sem o teto um
  // componente de 130% puxaria o índice inteiro para cima sem significar nada.
  const adherence = expected ? Math.min(100, Math.round((doneChecklists / expected) * 100)) : null;

  // ── Conferidos ──
  const reviewable = team.filter(c => c.date < today && c.operatorUserId !== leader.id);
  const reviewedByMe = reviewable.filter(c => c.reviewedBy === leader.id).length;
  const reviewRate = reviewable.length ? Math.round((reviewedByMe / reviewable.length) * 100) : null;
  const pending = reviewable.filter(c => !c.reviewedAt).length;

  const parts = [
    { key: 'prazo',      label: 'No prazo',   weight: 0.4, value: onTimeRate },
    { key: 'aderencia',  label: 'Aderência',  weight: 0.3, value: adherence },
    { key: 'conferidos', label: 'Conferidos', weight: 0.3, value: reviewRate },
  ];
  const usable = parts.filter(x => x.value != null);
  const wsum = usable.reduce((a, x) => a + x.weight, 0);
  const index = usable.length ? Math.round(usable.reduce((a, x) => a + x.value * x.weight, 0) / wsum) : null;

  return {
    index, parts,
    onTimeRate, onTimeDone, onTimeTotal,
    adherence, expected, doneChecklists, partialChecklists,
    reviewRate, reviewedByMe, reviewable: reviewable.length, pending,
    teamChecklists: team.length,
    scopeUnits, windowDays: days,
  };
}

/**
 * A tela do briefing. Folha inteira, não toast: é para ser LIDA antes do turno,
 * e um aviso que some sozinho não provoca reflexão nenhuma.
 */
/**
 * A caixa de justificar — uma folha curta, com o apontamento à vista.
 *
 * O enquadramento é JUSTIFICATIVA, não contestação (decisão de 08/08): o
 * colaborador já teve a chance de executar a tarefa e anotar observações na
 * hora; isto aqui é a segunda voz dele, depois do veredito — explicar, não
 * abrir litígio. O mecanismo por baixo é o mesmo (a liderança mantém ou
 * revisa), só a conversa muda de tom.
 *
 * Mostra o que está sendo justificado em cima do campo de propósito:
 * justificar de memória, um dia depois, é como a conversa vira "eu não fiz
 * isso" em vez de "a foto é de antes do turno". O texto é obrigatório pelo
 * mesmo padrão que se passou a cobrar da liderança — não faria sentido exigir
 * explicação de um lado só.
 */
function DisputeSheet({ item, accent, onClose, onSend }) {
  const [texto, setTexto] = useState('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');
  const VERD = { reprovado: 'Reprovada', ressalva: 'Com ressalva' };

  const enviar = async () => {
    if (!texto.trim()) { setErro('Escreva o que aconteceu — sem isso a liderança não tem o que avaliar.'); return; }
    setBusy(true); setErro('');
    const ok = await onSend(texto.trim());
    setBusy(false);
    if (ok) onClose();
    else setErro('Não foi possível enviar. Verifique a conexão e tente de novo.');
  };

  return (
    <div className="fixed inset-0 flex items-end justify-center z-50"
      style={{ background: 'rgba(11,60,92,0.5)' }} onClick={busy ? undefined : onClose}>
      <div onClick={e => e.stopPropagation()} className="w-full zc-sheet-panel"
        role="dialog" aria-modal="true" aria-label="Justificar a avaliação"
        style={{ maxWidth: 480, background: 'white', borderRadius: '20px 20px 0 0', padding: '24px 24px 40px', paddingBottom: 'calc(40px + env(safe-area-inset-bottom, 0px))' }}>
        <p className="font-display" style={{ fontWeight: W.semibold, fontSize: 'calc(17px * var(--zc-t-scale))', color: C.ink }}>
          Justificar a avaliação
        </p>
        <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: R.sm, padding: '10px 12px', margin: '12px 0' }}>
          <p style={{ fontSize: 13, color: C.ink, fontWeight: W.semibold }}>{item.texto}</p>
          <p style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>
            {VERD[item.verdict] || item.verdict}
            {item.checklist ? ` · ${item.checklist}` : ''}
          </p>
        </div>
        <label htmlFor="zc-dispute" style={{ display: 'block', fontSize: T.label, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.05em', color: C.mutedLight, marginBottom: 4 }}>
          Sua justificativa
        </label>
        <textarea id="zc-dispute" value={texto} onChange={e => setTexto(e.target.value)} rows={4} disabled={busy}
          placeholder="Explique o que aconteceu. Quanto mais concreto, mais fácil de verificar."
          style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', color: C.ink, resize: 'vertical' }} />
        <p style={{ fontSize: 11.5, color: C.mutedLight, marginTop: 8, lineHeight: 1.5 }}>
          Isto vai para quem avaliou a tarefa. Seus colegas não veem.
        </p>
        {erro && <p role="alert" style={{ fontSize: 13, color: C.critical, marginTop: 10 }}>{erro}</p>}
        <button onClick={enviar} disabled={busy} className="w-full py-3"
          style={{ marginTop: 14, borderRadius: 10, background: accent, color: 'white', fontWeight: W.semibold, fontSize: 15, border: 'none', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}>
          {busy ? 'Enviando…' : 'Enviar'}
        </button>
        <button onClick={onClose} disabled={busy} className="w-full py-2"
          style={{ borderRadius: 10, background: 'none', color: C.muted, fontWeight: W.semibold, fontSize: 13, border: 'none', cursor: 'pointer' }}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

function BriefingScreen({ briefing: b, userName, accent, onClose, disputes = [], onDispute }) {
  const [contestando, setContestando] = useState(null);
  // Contestação por tarefa, para a lista saber o que já foi dito.
  const disputaDe = useMemo(
    () => new Map((disputes || []).map(d => [`${d.completionId}|${d.itemId}`, d])),
    [disputes],
  );
  const corTom = b.tom === 'otimo' ? C.success : b.tom === 'atencao' ? C.critical : b.tom === 'quase' ? C.warning : accent;
  const dataLabel = new Date(`${b.date}T00:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });

  const VERD_LABEL = {
    reprovado: { texto: 'Reprovada', cor: C.critical },
    ressalva: { texto: 'Com ressalva', cor: C.warning },
    'critico-nao-feito': { texto: 'Crítica não executada', cor: C.critical },
    'nao-feito': { texto: 'Não executada', cor: C.muted },
    aprovado: { texto: 'Aprovada', cor: C.success },
  };

  return (
    <div className="fixed inset-0 z-50" style={{ background: C.bg, overflowY: 'auto' }}
      role="dialog" aria-modal="true" aria-label="Resumo do seu dia">
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '28px 20px calc(40px + env(safe-area-inset-bottom, 0px))' }}>

        <div style={{ background: corTom, color: 'white', borderRadius: 16, padding: 20, marginBottom: 16 }}>
          <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.9, fontWeight: W.semibold }}>
            Seu dia · {dataLabel}
          </p>
          <p className="font-display" style={{ fontSize: 'calc(22px * var(--zc-t-scale))', fontWeight: W.bold, marginTop: 6, lineHeight: 1.25 }}>
            {b.titulo}
          </p>
          <p style={{ fontSize: 14, opacity: 0.92, marginTop: 8, lineHeight: 1.5 }}>{b.resumo}</p>
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          {[
            ['Aprovadas', b.aprovadas, C.success],
            ['Ressalvas', b.ressalvas, C.warning],
            ['Reprovadas', b.reprovadas, C.critical],
            ['Não feitas', b.naoFeitas, C.muted],
          ].map(([label, valor, cor]) => (
            <div key={label} style={{ flex: 1, minWidth: 72, background: 'white', border: `1px solid ${C.border}`, borderRadius: R.md, padding: '12px 10px', textAlign: 'center' }}>
              <p className="font-display" style={{ fontSize: 'calc(22px * var(--zc-t-scale))', fontWeight: W.bold, color: valor ? cor : C.mutedLight }}>{valor}</p>
              <p style={{ fontSize: T.label, color: C.mutedLight, marginTop: 2 }}>{label}</p>
            </div>
          ))}
        </div>

        {/* O que a liderança escreveu vem ANTES do texto automático: é a única
            parte do briefing que uma pessoa pensou especificamente sobre esta
            pessoa. */}
        {b.comentarios.length > 0 && (
          <div style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: R.md, padding: 16, marginBottom: 16 }}>
            <Eyebrow>O que a liderança comentou</Eyebrow>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
              {b.comentarios.map((cm, n) => (
                <div key={n} style={{ borderLeft: `3px solid ${VERD_LABEL[cm.verdict]?.cor || C.border}`, paddingLeft: 10 }}>
                  {cm.tarefa && <p style={{ fontSize: 12, fontWeight: W.semibold, color: C.ink }}>{cm.tarefa}</p>}
                  <p style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.5, fontStyle: 'italic' }}>“{cm.texto}”</p>
                  {cm.autor && <p style={{ fontSize: 11, color: C.mutedLight, marginTop: 2 }}>— {cm.autor}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {b.itensProblema.length > 0 && (
          <div style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: R.md, padding: 16, marginBottom: 16 }}>
            <Eyebrow>Tarefas que precisam de atenção</Eyebrow>
            <div style={{ marginTop: 8 }}>
              {b.itensProblema.map((it, n) => {
                // Justificável = apontamento da liderança. Tarefa que a pessoa
                // não executou aparece na lista, mas não há veredito a
                // justificar ali — o fato é o fato.
                const contestavel = onDispute && it.completionId && it.itemId
                  && (it.verdict === 'reprovado' || it.verdict === 'ressalva');
                const d = disputaDe.get(`${it.completionId}|${it.itemId}`);
                return (
                  <div key={n} style={{ display: 'flex', gap: 8, padding: '7px 0', borderBottom: n < b.itensProblema.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                    <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: R.pill, background: VERD_LABEL[it.verdict]?.cor || C.muted, flexShrink: 0, marginTop: 6 }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ fontSize: 13.5, color: C.ink }}>{it.texto}</p>
                      <p style={{ fontSize: 11, color: VERD_LABEL[it.verdict]?.cor || C.muted, fontWeight: W.semibold, marginTop: 1 }}>
                        {VERD_LABEL[it.verdict]?.texto || it.verdict}{it.checklist ? ` · ${it.checklist}` : ''}
                      </p>
                      {/* O estado da conversa, quando ela existe. Uma
                          justificativa que some da tela depois de enviada faz a
                          pessoa achar que não foi. */}
                      {d ? (
                        <p style={{ fontSize: 11, color: d.status === 'revista' ? C.success : d.status === 'mantida' ? C.muted : C.warning, fontWeight: W.semibold, marginTop: 3 }}>
                          {d.status === 'aberta' && 'Justificativa enviada · aguardando resposta'}
                          {d.status === 'revista' && `Revisto por ${d.resolvedByName || 'liderança'}`}
                          {d.status === 'mantida' && `Mantido por ${d.resolvedByName || 'liderança'}`}
                          {d.resolutionNote && <span style={{ fontWeight: 400, color: C.muted }}> — “{d.resolutionNote}”</span>}
                        </p>
                      ) : contestavel && (
                        <button onClick={() => setContestando(it)}
                          style={{ fontSize: 11, fontWeight: W.semibold, color: accent, background: 'none', border: `1px dashed ${C.border}`, borderRadius: R.pill, padding: '2px 10px', marginTop: 4, cursor: 'pointer' }}>
                          Deseja justificar?
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ background: `${accent}0D`, border: `1px solid ${accent}33`, borderRadius: R.md, padding: 16, marginBottom: 20 }}>
          <Eyebrow>Para hoje</Eyebrow>
          <ul style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 10, listStyle: 'none' }}>
            {b.sugestoes.map((sg, n) => (
              <li key={n} style={{ display: 'flex', gap: 8 }}>
                <Lightbulb size={15} color={accent} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
                <span style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.5 }}>{sg}</span>
              </li>
            ))}
          </ul>
        </div>

        <button onClick={onClose} className="w-full py-3"
          style={{ borderRadius: 10, background: accent, color: 'white', fontWeight: W.semibold, fontSize: 15, border: 'none', cursor: 'pointer' }}>
          Começar o dia
        </button>
        <p style={{ fontSize: 11.5, color: C.mutedLight, textAlign: 'center', marginTop: 10 }}>
          Você pode reler este resumo em Meu ID.
        </p>
      </div>

      {contestando && (
        <DisputeSheet
          item={contestando} accent={accent}
          onClose={() => setContestando(null)}
          onSend={texto => onDispute(contestando.completionId, contestando.itemId, texto)}
        />
      )}
    </div>
  );
}

/**
 * BRIEFING DIÁRIO DO COLABORADOR
 * ---------------------------------------------------------------------------
 * "Como foi o meu dia", montado a partir do que a liderança conferiu. Aparece
 * no primeiro acesso do dia seguinte, para a pessoa refletir antes de começar.
 *
 * Duas escolhas de produto que estão no código e não em configuração:
 *
 * 1. SÓ EXISTE BRIEFING DE DIA CONFERIDO. Sem conferência, o texto seria a
 *    pessoa se autoavaliando pelo que ela mesma marcou — que é exatamente o
 *    que a conferência veio corrigir. Dia não conferido não gera briefing;
 *    não gera um briefing vazio.
 * 2. O TEXTO É DERIVADO, NÃO GERADO. Cada frase sai de um número que a pessoa
 *    pode conferir na própria tela. Um elogio genérico some no segundo dia;
 *    "os 3 críticos do fechamento saíram" não.
 *
 * `buildBriefingText` está isolada de propósito: trocar as sugestões por IA
 * (decisão de 26/07 — regras agora, IA depois) é substituir esta função, sem
 * tocar em banco, em tela ou no gatilho.
 */
function buildDailyBriefing({ completions, userId, userName, today }) {
  // O dia mais recente ANTES de hoje em que a pessoa executou algo e a
  // liderança conferiu. Não varre o ano inteiro: se ninguém conferiu na última
  // semana, o assunto esfriou e um briefing de dez dias atrás é ruído.
  const JANELA = 7;
  // Do mais recente ao mais antigo: o loop abaixo para no primeiro dia com dados.
  const dias = [];
  for (let i = 1; i <= JANELA; i++) dias.push(addDays(today, -i));

  for (const dia of dias) {
    /**
     * O DIA DA PESSOA É POR TAREFA, NÃO POR CHECKLIST.
     *
     * Antes, o briefing filtrava por `operatorUserId` — quem submeteu. Numa
     * rodada dividida entre três pessoas, quem apertou "Concluir" recebia o
     * feedback de todo mundo, e os outros dois abriam o app sem briefing
     * nenhum, mesmo tendo sido avaliados nominalmente.
     *
     * Uma tarefa é minha, em ordem de autoridade:
     *   1. a liderança endereçou o veredito a mim (`review.executedBy`) — é o
     *      dado mais forte, porque foi resolvido no servidor a partir do items;
     *   2. eu a executei (`doneBy`);
     *   3. ninguém executou (tarefa em branco) E o checklist é meu — tarefa não
     *      feita não tem executor, então responde quem entregou a rodada.
     */
    const conferidos = (completions || []).filter(c => c.date === dia && c.reviewedAt);
    if (!conferidos.length) continue;   // ver escolha (1)

    const souSubmissor = c => c.operatorUserId === userId || c.operatorName === userName;
    const minha = (i, c) => {
      if (i.review?.executedBy) return i.review.executedBy === userId;
      if (i.doneBy || i.doneByName) return i.doneBy === userId || i.doneByName === userName;
      return souSubmissor(c);
    };

    const itens = conferidos.flatMap(c => (c.items || []).filter(i => minha(i, c)).map(i => ({ ...i, _c: c })));
    if (!itens.length) continue;   // conferiram o dia, mas nada era desta pessoa

    // Os checklists em que ela pôs a mão — não os que ela submetiu.
    const meusChecklists = new Set(itens.map(i => i._c?.id).filter(Boolean));

    const aprovadas = itens.filter(i => i.review?.verdict === 'aprovado');
    const ressalvas = itens.filter(i => i.review?.verdict === 'ressalva');
    const reprovadas = itens.filter(i => i.review?.verdict === 'reprovado');
    const naoFeitas = itens.filter(i => !i.done);
    const criticasNaoFeitas = naoFeitas.filter(i => i.critical);
    const julgadas = aprovadas.length + ressalvas.length + reprovadas.length;

    // Notas que a liderança escreveu — o que ela digitou vale mais que
    // qualquer frase que este código consiga montar, então vem antes.
    const comentarios = [
      ...itens.filter(i => i.review?.note).map(i => ({
        tarefa: i.text || `Item ${i.id}`,
        verdict: i.review.verdict,
        texto: i.review.note,
        autor: i.review.byName,
      })),
    ];
    // Só a nota geral dos checklists em que a pessoa trabalhou. Sem o recorte,
    // ela leria o recado que a liderança escreveu sobre a rodada de um colega.
    const gerais = conferidos.filter(c => c.reviewNote && meusChecklists.has(c.id))
      .map(c => ({ tarefa: null, verdict: null, texto: c.reviewNote, autor: c.reviewedByName }));

    const taxa = julgadas ? Math.round((aprovadas.length / julgadas) * 100) : null;

    return {
      date: dia,
      checklists: meusChecklists.size,
      conferidos: meusChecklists.size,
      aprovadas: aprovadas.length,
      ressalvas: ressalvas.length,
      reprovadas: reprovadas.length,
      naoFeitas: naoFeitas.length,
      criticasNaoFeitas: criticasNaoFeitas.length,
      julgadas,
      taxa,
      comentarios: [...gerais, ...comentarios].slice(0, 6),
      itensProblema: [...reprovadas, ...ressalvas, ...criticasNaoFeitas]
        .slice(0, 6)
        .map(i => ({
          texto: i.text || `Item ${i.id}`,
          verdict: i.review?.verdict || (i.critical ? 'critico-nao-feito' : 'nao-feito'),
          checklist: i._c?.templateName,
          // Identificam a tarefa para a contestação. Sem eles a pessoa lê o
          // apontamento e não tem como responder a ele.
          completionId: i._c?.id,
          itemId: i.id,
        })),
      ...buildBriefingText({
        userName, taxa,
        aprovadas: aprovadas.length, ressalvas: ressalvas.length, reprovadas: reprovadas.length,
        naoFeitas: naoFeitas.length, criticasNaoFeitas: criticasNaoFeitas.length,
      }),
    };
  }
  return null;
}

/**
 * O texto do briefing: um veredito de uma linha e as sugestões para amanhã.
 *
 * TROCAR POR IA É SUBSTITUIR ESTA FUNÇÃO — nada fora dela sabe como as frases
 * são produzidas.
 *
 * As sugestões saem em ordem de gravidade e no máximo três: uma lista de oito
 * itens não é um plano, é uma bronca, e ninguém age sobre oito coisas antes do
 * turno começar.
 */
function buildBriefingText({ userName, taxa, aprovadas, ressalvas, reprovadas, naoFeitas, criticasNaoFeitas }) {
  const primeiro = (userName || '').split(' ')[0] || 'Você';
  let titulo, tom;
  if (reprovadas === 0 && naoFeitas === 0 && ressalvas === 0) {
    titulo = `Dia limpo, ${primeiro}.`; tom = 'otimo';
  } else if (criticasNaoFeitas > 0 || reprovadas > 1) {
    titulo = `Ontem escapou coisa importante, ${primeiro}.`; tom = 'atencao';
  } else if (reprovadas === 1 || ressalvas > 0 || naoFeitas > 0) {
    titulo = `Quase lá, ${primeiro}.`; tom = 'quase';
  } else {
    titulo = `Seu dia de ontem, ${primeiro}.`; tom = 'neutro';
  }

  const resumo = taxa == null
    ? 'A liderança conferiu seu trabalho e não apontou pendências.'
    : `${aprovadas} de ${aprovadas + ressalvas + reprovadas} tarefas conferidas foram aprovadas${taxa === 100 ? ' — todas.' : ` (${taxa}%).`}`;

  const sugestoes = [];
  if (criticasNaoFeitas > 0) {
    sugestoes.push(`Comece pelos itens críticos. ${criticasNaoFeitas === 1 ? 'Um ficou' : `${criticasNaoFeitas} ficaram`} sem execução ontem, e é o tipo de item que vira problema para a loja inteira.`);
  }
  if (reprovadas > 0) {
    sugestoes.push(`${reprovadas === 1 ? 'Uma tarefa foi reprovada' : `${reprovadas} tarefas foram reprovadas`} — leia o comentário da liderança e refaça hoje com o padrão que ela pediu.`);
  }
  if (ressalvas > 0) {
    sugestoes.push(`${ressalvas === 1 ? 'Uma tarefa passou com ressalva' : `${ressalvas} tarefas passaram com ressalva`}: foi entregue, mas dá para fazer melhor. Vale reler a observação antes de repetir a rotina.`);
  }
  if (naoFeitas > criticasNaoFeitas) {
    sugestoes.push(`Sobraram ${naoFeitas - criticasNaoFeitas} tarefa(s) sem marcar. Se faltou tempo, avise a liderança durante o turno em vez de deixar em branco no fim.`);
  }
  if (!sugestoes.length) {
    sugestoes.push('Mantenha o ritmo: o que funcionou ontem foi concluir tudo e registrar as evidências na hora, não no fim do turno.');
  }

  return { titulo, tom, resumo, sugestoes: sugestoes.slice(0, 3) };
}

export function OperationalIdView({ targetUser, viewer, completions, templates, accent, onRecognize, onChangePhoto, briefing, onOpenBriefing }) {
  const isSelf = !viewer || viewer.id === targetUser.id;
  // A tela é o perfil da pessoa, mas mostrava só nome e papel. Sem a loja, quem
  // abre o ID de um colaborador em empresa com várias unidades não sabe de onde
  // ele é — e gerência/diretoria, que agora também têm a aba, não têm unidade
  // fixa: para elas o escopo REAL é a empresa inteira, e é isso que se diz.
  const idUnits = useUnits();
  const scopeLabel = targetUser.unitId
    ? ((idUnits || []).find(u => u.id === targetUser.unitId)?.name || null)
    : (MANAGER_ROLES.includes(targetUser.role) ? 'Todas as lojas' : null);
  const p = useMemo(
    () => computeOperationalProfile(completions, targetUser.id, targetUser.name, tzOfUnit(idUnits, targetUser.unitId), templates, idUnits),
    [completions, targetUser.id, targetUser.name, idUnits, templates],
  );
  // Score de produtividade da pessoa vs média da empresa (mesma régua do Relatórios)
  const prodScore = useMemo(() => {
    const prod = computeProductivity(completions);
    return prod.collaborators.find(e => e.key === targetUser.id || e.name === targetUser.name) || null;
  }, [completions, targetUser.id, targetUser.name]);
  const [survey, setSurvey] = useState(null);
  const [recognitions, setRecognitions] = useState([]);

  useEffect(() => {
    if (isSelf) {
      track('operational_id_viewed', { source: 'id', metadata: { level: p.level, checklists: p.checklists, streak: p.streak } });
    } else {
      track('collaborator_profile_viewed', { source: 'equipe', unitId: targetUser.unitId || undefined, metadata: { target_user_id: targetUser.id, level: p.level, checklists: p.checklists } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetUser.id]);

  // Reconhecimentos recebidos (fecha o loop do H2/H3). Só na visão do próprio colaborador.
  useEffect(() => {
    if (!isSelf) return;
    let cancel = false;
    fetchRecognitions(targetUser.id).then(list => {
      if (cancel) return;
      setRecognitions(list);
      try {
        const key = `zc_seen_recognitions_${targetUser.id}`;
        const seen = new Set(JSON.parse(localStorage.getItem(key) || '[]'));
        const fresh = list.filter(r => !seen.has(r.id));
        fresh.forEach(r => track('recognition_received', { source: 'id', metadata: { recognition_id: r.id, metric_ref: r.metricRef } }));
        if (fresh.length) localStorage.setItem(key, JSON.stringify(list.map(r => r.id).slice(0, 200)));
      } catch (_) {}
    });
    return () => { cancel = true; };
  }, [isSelf, targetUser.id]);

  // Medalhas conquistadas (H5) — emite badge_earned quando o colaborador vê
  // uma conquista nova pela primeira vez. Só na visão do próprio colaborador.
  useEffect(() => {
    if (!isSelf) return;
    try {
      const key = `zc_seen_badges_${targetUser.id}`;
      const seen = new Set(JSON.parse(localStorage.getItem(key) || '[]'));
      const earned = p.achievements.filter(a => a.earned);
      const fresh = earned.filter(a => !seen.has(a.id));
      fresh.forEach(a => track('badge_earned', { source: 'id', metadata: { badge_id: a.id, checklists: p.checklists } }));
      if (fresh.length) localStorage.setItem(key, JSON.stringify(earned.map(a => a.id)));
    } catch (_) {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSelf, targetUser.id]);

  const answerSurvey = ans => {
    if (survey) return;
    setSurvey(ans);
    track('survey_answered', { source: 'id', metadata: { question: 'operational_id_motivates', answer: ans } });
  };

  const firstName = (targetUser.name || '').split(' ')[0];
  const earnedCount = p.achievements.filter(a => a.earned).length;
  const maxWeekRate = Math.max(1, ...p.weekly.map(w => w.rate));

  // Foto + botão de troca. `onChangePhoto` só chega na visão do próprio dono —
  // o líder que abre o ID de um colaborador vê a foto, não o botão.
  const IdAvatar = ({ size, onDark = true }) => (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <Avatar user={targetUser} size={size}
        bg={onDark ? 'rgba(255,255,255,0.2)' : `${accent}18`} fg={onDark ? 'white' : accent}
        style={{ fontWeight: W.bold }} />
      {onChangePhoto && (
        <button onClick={onChangePhoto} title="Trocar foto de perfil" aria-label="Trocar foto de perfil"
          style={{
            position: 'absolute', right: -2, bottom: -2, width: 24, height: 24, borderRadius: 999,
            background: 'white', border: `1px solid ${C.border}`, display: 'grid', placeItems: 'center',
            cursor: 'pointer', padding: 0,
          }}>
          <Camera size={13} color={accent} aria-hidden />
        </button>
      )}
    </div>
  );

  const Metric = ({ value, label, color }) => (
    <div style={{ flex: 1, textAlign: 'center', padding: '10px 4px' }}>
      <p style={{ fontSize: 24, fontWeight: W.bold, color: color || C.ink, lineHeight: 1 }}>{value}</p>
      <p style={{ fontSize: 10.5, color: C.muted, marginTop: 4, fontWeight: W.semibold }}>{label}</p>
    </div>
  );

  if (p.checklists === 0 && p.tasksDone === 0) {
    return (
      <div style={{ padding: 20 }}>
        <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${C.border}`, padding: '28px 20px', textAlign: 'center' }}>
          {/* Quem ainda não executou nada TAMBÉM precisa poder pôr foto — este
              é justamente o estado do 1º acesso, e a tela cai aqui antes do
              cabeçalho normal. */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
            {targetUser.avatarUrl || onChangePhoto
              ? <IdAvatar size={64} onDark={false} />
              : <Sprout size={40} color={C.mutedLight} strokeWidth={1.5} aria-hidden />}
          </div>
          <p className="font-display" style={{ fontSize: 'calc(18px * var(--zc-t-scale))', fontWeight: W.semibold, color: C.ink }}>
            {isSelf ? 'Seu ID Operacional começa aqui' : `${firstName} ainda não tem histórico`}
          </p>
          <p style={{ fontSize: 12, color: C.muted, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: W.semibold }}>
            {targetUser.name} · {ROLE_LABELS[targetUser.role] || targetUser.role}{scopeLabel ? ` · ${scopeLabel}` : ''}
          </p>
          <p style={{ fontSize: 13, color: C.muted, marginTop: 8, lineHeight: 1.5, maxWidth: 300, marginInline: 'auto' }}>
            {isSelf
              ? 'Conclua seu primeiro checklist e comece a construir seu histórico, sua sequência e suas conquistas.'
              : 'Quando começar a concluir checklists, os indicadores e a evolução aparecem aqui.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '14px 14px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Cabeçalho — identidade + nível */}
      <div style={{ background: accent, color: 'white', borderRadius: 16, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <IdAvatar size={52} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="font-display" style={{ fontSize: 'calc(18px * var(--zc-t-scale))', fontWeight: W.semibold }}>{targetUser.name}</p>
            <p style={{ fontSize: 12, opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {ROLE_LABELS[targetUser.role] || targetUser.role}{scopeLabel ? ` · ${scopeLabel}` : ''}
            </p>
          </div>
          <div style={{ textAlign: 'center', flexShrink: 0 }}>
            <p style={{ fontSize: 10, opacity: 0.8, fontWeight: W.semibold }}>NÍVEL</p>
            <p className="font-display" style={{ fontSize: 'calc(26px * var(--zc-t-scale))', fontWeight: W.bold, lineHeight: 1 }}>{p.level}</p>
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, opacity: 0.85, marginBottom: 4 }}>
            <span>Progresso do nível</span><span>{p.intoLevel}/{p.perLevel} checklists</span>
          </div>
          <div style={{ height: 7, background: 'rgba(255,255,255,0.25)', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(p.intoLevel / p.perLevel) * 100}%`, background: 'white', borderRadius: 999 }} />
          </div>
        </div>
      </div>

      {/* Reler o briefing. A tela do briefing promete "você pode reler em Meu
          ID" — sem este botão, seria uma promessa quebrada. */}
      {briefing && onOpenBriefing && (
        <button onClick={onOpenBriefing}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
            background: '#fff', border: `1px solid ${C.border}`, borderRadius: R.md,
            padding: '12px 14px', cursor: 'pointer', fontFamily: 'inherit',
          }}>
          <Lightbulb size={17} color={accent} aria-hidden style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: T.bodySm, fontWeight: W.semibold, color: C.ink }}>Resumo do seu dia</span>
            <span style={{ display: 'block', fontSize: T.label, color: C.mutedLight, marginTop: 1 }}>
              {new Date(`${briefing.date}T00:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })} · conferido pela liderança
            </span>
          </span>
          <ChevronRight size={18} color={C.mutedLight} style={{ flexShrink: 0 }} />
        </button>
      )}

      {/* Índice operacional — o mesmo número que ordena o ranking da Equipe.
          Um ranking cujo número não dá para inspecionar é só uma opinião: aqui
          o colaborador vê exatamente o que compõe a posição dele. Mesma
          estrutura do ID da unidade, com os pesos que fazem sentido para uma
          pessoa (ela não tem "esperado" — ver computeOperationalProfile). */}
      {p.index != null && (
        <section style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: R.md, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <IndexRing value={p.index} accent={accent} size={72} />
            <div style={{ flex: 1, minWidth: 200 }}>
              {/* A janela no cabeçalho, não numa nota de rodapé: sem ela, os
                  cinco percentuais abaixo não respondem "de quando?" — e a
                  pessoa não sabe se um mês ruim ainda a persegue. */}
              <p style={{ fontSize: T.label, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted }}>
                Índice operacional · {p.periodLabel}
              </p>
              <p style={{ fontSize: T.label, color: C.mutedLight, marginTop: 2 }}>
                {p.checklistsJanela} checklist{p.checklistsJanela === 1 ? '' : 's'} no período · nível e conquistas contam a história toda
              </p>
              <div style={{ marginTop: 8 }}>
                {p.parts.map(part => (
                  <div key={part.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
                    <span style={{ fontSize: T.caption, color: C.ink, flex: 1 }}>{part.label}</span>
                    <span style={{ fontSize: T.label, color: C.mutedLight }}>{Math.round(part.weight * 100)}%</span>
                    <span className="font-display" style={{ fontSize: T.bodySm, fontWeight: W.semibold, color: C.ink, width: 44, textAlign: 'right' }}>
                      {part.value == null ? '—' : `${part.value}%`}
                    </span>
                  </div>
                ))}
              </div>
              {/* A pontualidade ganha linha própria, e não só a do
                  detalhamento: é o número que a pessoa consegue mudar amanhã de
                  manhã, e o único cuja conta cabe inteira numa frase. Os dois
                  brutos vão junto porque "87%" não deixa ninguém conferir se
                  são 13 de 15 ou 87 de 100 — e a diferença muda o quanto um
                  atraso pesa. */}
              {p.punctuality != null && (
                <p style={{ fontSize: T.caption, color: C.ink, marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Clock size={13} color={p.punctuality >= 90 ? C.success : p.punctuality >= 70 ? C.warning : C.critical} aria-hidden />
                  <span>
                    <strong style={{ fontWeight: W.semibold, color: p.punctuality >= 90 ? C.success : p.punctuality >= 70 ? C.warning : C.critical }}>
                      {p.punctuality}% no prazo
                    </strong>
                    <span style={{ color: C.mutedLight }}> · {p.prazoOk} de {p.prazoTotal} entregas com prazo no período</span>
                  </span>
                </p>
              )}
              <p style={{ fontSize: T.label, color: C.mutedLight, marginTop: 6 }}>
                Constância = dias com atividade nos últimos {p.consistencyWindow} dias.
              </p>
              <p style={{ fontSize: T.label, color: C.mutedLight, marginTop: 2 }}>
                {p.punctuality != null
                  ? 'Entregas no prazo = checklists que você entregou dentro do horário do próprio checklist. Checklist sem prazo definido não entra na conta.'
                  : 'Entregas no prazo aparece quando você entregar um checklist que tenha horário definido.'}
              </p>
              {/* A régua da qualidade, por extenso. Quem é medido tem que
                  conseguir refazer a conta de cabeça — "ressalva vale 0,6 numa
                  média ponderada" não passa nesse teste; "cada reprovação
                  custa 8 pontos" passa. */}
              <p style={{ fontSize: T.label, color: C.mutedLight, marginTop: 2 }}>
                {p.qualidade != null
                  ? `Qualidade = 100 − (ressalvas × 2 + reprovações × 8), sobre ${p.julgadas} tarefas avaliadas pela liderança no período. Apontamento sem motivo escrito não desconta.`
                  : `Qualidade entra quando a liderança tiver avaliado ao menos ${QUALITY_MIN_JULGADAS} das suas tarefas no período (vale para avaliações a partir de 09/08/2026).`}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Reconhecer (visão do líder — H3) */}
      {!isSelf && (
        <button onClick={() => onRecognize && onRecognize(p)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px 0', borderRadius: 12, background: accent, color: 'white', border: 'none', fontWeight: W.semibold, fontSize: 14.5, cursor: 'pointer' }}>
          <Award size={17} aria-hidden /> Reconhecer {firstName}
        </button>
      )}

      {/* Reconhecimentos recebidos (visão do próprio colaborador) */}
      {isSelf && recognitions.length > 0 && (
        <div style={{ background: 'white', borderRadius: 14, border: `1px solid ${C.success}55`, padding: 14 }}>
          <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: W.semibold, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
            <Award size={13} aria-hidden /> Reconhecimentos recebidos
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {recognitions.slice(0, 5).map(r => (
              <div key={r.id} style={{ borderLeft: `3px solid ${C.success}`, paddingLeft: 10 }}>
                {r.metricLabel && <p style={{ fontSize: 12.5, fontWeight: W.semibold, color: C.ink }}>{r.metricLabel}</p>}
                {r.message && <p style={{ fontSize: 12.5, color: C.ink, lineHeight: 1.4 }}>"{r.message}"</p>}
                <p style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>— {r.fromUserName || 'Liderança'}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Indicadores — tarefas contam também a participação em checklists de colegas */}
      <div style={{ background: 'white', borderRadius: 14, border: `1px solid ${C.border}`, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
        <Metric value={p.checklists} label="Checklists" />
        <Metric value={p.tasksDone} label="Tarefas" />
        <Metric value={p.criticalDone} label="Críticas feitas" color={p.criticalDone > 0 ? C.success : C.ink} />
        <Metric value={`${p.avgRate}%`} label="Conclusão" color={p.avgRate >= 80 ? C.success : p.avgRate >= 50 ? C.warning : C.critical} />
        <Metric value={p.criticalRate != null ? `${p.criticalRate}%` : '—'} label="Críticos em dia" color={p.criticalRate != null && p.criticalRate >= 90 ? C.success : C.ink} />
        <Metric label="Sequência" value={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            {p.streak}
            {p.streak > 0 && <Flame size={17} color={C.warning} aria-hidden />}
          </span>
        } />
      </div>

      {/* Score de produtividade — mesma régua do Relatórios (100 = média da empresa) */}
      {(() => {
        const score = prodScore?.score ?? null;
        const color = score == null ? C.muted : score >= 110 ? C.success : score >= 90 ? accent : score >= 70 ? C.warning : C.critical;
        const barPct = score == null ? 0 : Math.min(score, 150) / 1.5;
        return (
          <div style={{ background: 'white', borderRadius: 14, border: `1px solid ${C.border}`, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 11, fontWeight: W.semibold, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Score de produtividade</p>
                <p style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>100 = média da empresa</p>
              </div>
              <p className="font-display" style={{ fontSize: 'calc(32px * var(--zc-t-scale))', fontWeight: W.bold, color, lineHeight: 1, flexShrink: 0 }}>
                {score == null ? '—' : score}
              </p>
            </div>
            <div style={{ position: 'relative', width: '100%', height: 7, background: C.border, borderRadius: 999, overflow: 'hidden', marginTop: 10 }}>
              <div style={{ height: '100%', width: `${barPct}%`, background: color, borderRadius: 999 }} />
              <div style={{ position: 'absolute', left: `${100 / 1.5}%`, top: 0, bottom: 0, width: 2, background: C.ink, opacity: 0.35 }} />
            </div>
            <p style={{ fontSize: 10.5, color: C.muted, marginTop: 8, lineHeight: 1.5 }}>
              {score == null
                ? 'O score aparece conforme as novas execuções registram o horário de cada tarefa.'
                : `${prodScore.rate.toFixed(1)} pts/h · ${Math.round(prodScore.points)} pontos no período · tarefa crítica vale 2 pts e checklist 100% dá bônus.`}
            </p>
          </div>
        );
      })()}

      {/* Evolução */}
      <div style={{ background: 'white', borderRadius: 14, border: `1px solid ${C.border}`, padding: 14 }}>
        <p style={{ fontSize: 11, fontWeight: W.semibold, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Sua evolução (conclusão por semana)</p>
        {p.weekly.length === 0 ? (
          <p style={{ fontSize: 12, color: C.mutedLight }}>Ainda sem histórico semanal.</p>
        ) : (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 96 }}>
            {p.weekly.map(w => (
              <div key={w.week} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 10, fontWeight: W.semibold, color: C.muted }}>{w.rate}%</span>
                <div style={{ width: '100%', height: 64, display: 'flex', alignItems: 'flex-end' }}>
                  <div style={{ width: '100%', height: `${Math.max(6, (w.rate / maxWeekRate) * 64)}px`, background: w.rate >= 80 ? C.success : w.rate >= 50 ? accent : C.critical, borderRadius: '6px 6px 0 0' }} />
                </div>
                <span style={{ fontSize: 9, color: C.mutedLight }}>{w.week.slice(8, 10)}/{w.week.slice(5, 7)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Conquistas */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, paddingInline: 2 }}>
          <p style={{ fontSize: 11, fontWeight: W.semibold, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Conquistas</p>
          <p style={{ fontSize: 11, fontWeight: W.semibold, color: C.muted }}>{earnedCount}/{p.achievements.length}</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {p.achievements.map(a => (
            // Conquistada vs. bloqueada é só cor — o `filter: grayscale(1)` que
            // dessaturava o emoji não é mais necessário num ícone de traço.
            <div key={a.id} style={{ background: 'white', borderRadius: 12, border: `1px solid ${a.earned ? `${C.success}55` : C.border}`, padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'center', opacity: a.earned ? 1 : 0.5 }}>
              <a.Icon size={20} strokeWidth={1.75} aria-hidden
                color={a.earned ? C.success : C.mutedLight} style={{ flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 12.5, fontWeight: W.semibold, color: C.ink }}>{a.title}</p>
                <p style={{ fontSize: 10.5, color: C.muted, lineHeight: 1.3 }}>{a.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Histórico recente */}
      {p.recent.length > 0 && (
        <div style={{ background: 'white', borderRadius: 14, border: `1px solid ${C.border}`, padding: 14 }}>
          <p style={{ fontSize: 11, fontWeight: W.semibold, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Histórico recente</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {p.recent.map(c => {
              const done = (c.items || []).filter(i => i.done).length;
              const total = (c.items || []).length;
              const rate = total ? Math.round((done / total) * 100) : 0;
              return (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 6, height: 6, borderRadius: 999, background: rate >= 80 ? C.success : rate >= 50 ? C.warning : C.critical, flexShrink: 0 }} />
                  <p style={{ flex: 1, fontSize: 12.5, color: C.ink, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{truncName(c.templateName, 28)}</p>
                  <span style={{ fontSize: 11, color: C.muted }}>{c.date.slice(8, 10)}/{c.date.slice(5, 7)}</span>
                  <span style={{ fontSize: 11, fontWeight: W.semibold, color: rate >= 80 ? C.success : C.muted, width: 34, textAlign: 'right' }}>{rate}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Micro-pergunta qualitativa (§10) — só na visão do próprio colaborador */}
      {isSelf && (
        <div style={{ background: 'white', borderRadius: 12, border: `1px solid ${C.border}`, padding: '12px 14px', textAlign: 'center' }}>
          {survey ? (
            <p style={{ fontSize: 13, color: C.success, fontWeight: W.semibold }}>Obrigado pelo retorno!</p>
          ) : (
            <>
              <p style={{ fontSize: 13, color: C.ink, marginBottom: 10, fontWeight: W.semibold }}>Ver sua evolução aqui te motiva?</p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <FeedbackThumbs onRate={answerSurvey} size={17} />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------ Equipe + Reconhecimento (H3) ------------------------------ */
// Âncoras de métrica derivadas do perfil — o reconhecimento fica ancorado num dado objetivo.
function buildMetricAnchors(p) {
  const a = [];
  if (p.avgRate >= 90) a.push({ ref: 'conclusao_alta', label: `Alta conclusão (${p.avgRate}%)` });
  if (p.criticalRate != null && p.criticalRate >= 95) a.push({ ref: 'guardiao_critico', label: 'Itens críticos sempre em dia' });
  if (p.bestStreak >= 5) a.push({ ref: 'constancia', label: `Constância (${p.bestStreak} dias seguidos)` });
  if (p.evidences >= 20) a.push({ ref: 'evidencias', label: 'Provas sempre em dia' });
  p.achievements.filter(x => x.earned).forEach(x => a.push({ ref: `ach_${x.id}`, label: x.title }));
  const seen = new Set();
  const out = [];
  for (const x of a) { if (!seen.has(x.ref)) { seen.add(x.ref); out.push(x); } }
  return out.slice(0, 6);
}

function RecognizeModal({ target, profile, currentUser, unitId, companyId, accent, onClose, onSent }) {
  const anchors = buildMetricAnchors(profile);
  const [metricRef, setMetricRef] = useState(anchors[0]?.ref ?? '');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const firstName = (target.name || '').split(' ')[0];

  const send = async () => {
    setSending(true);
    const anchor = anchors.find(a => a.ref === metricRef);
    const ok = await sendRecognition({
      companyId, fromUserId: currentUser.id, fromUserName: currentUser.name,
      toUserId: target.id, toUserName: target.name, unitId,
      metricRef: metricRef || null, metricLabel: anchor?.label || null, message: message.trim() || null,
    });
    track('recognition_sent', { source: 'equipe', unitId: unitId || undefined, metadata: { to_user_id: target.id, has_metric: !!metricRef, metric_ref: metricRef || null } });
    setSending(false);
    onSent(ok);
  };

  return (
    <div className="zc-sheet" style={{ position: 'fixed', inset: 0, zIndex: 210, background: 'rgba(6,60,92,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div className="zc-sheet-panel" style={{ width: '100%', maxWidth: 480, background: C.bg, borderRadius: '20px 20px 0 0', padding: 18, paddingBottom: 'calc(18px + env(safe-area-inset-bottom, 0px))' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <p className="font-display" style={{ fontSize: 'calc(18px * var(--zc-t-scale))', fontWeight: W.semibold, color: C.ink, display: 'flex', alignItems: 'center', gap: 7 }}><Award size={18} aria-hidden /> Reconhecer {firstName}</p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: C.muted, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <p style={{ fontSize: 12, fontWeight: W.semibold, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Ancorar numa métrica</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {anchors.map(a => (
            <button key={a.ref} onClick={() => setMetricRef(a.ref)}
              style={{ textAlign: 'left', padding: '11px 12px', borderRadius: 10, border: `1.5px solid ${metricRef === a.ref ? accent : C.border}`, background: metricRef === a.ref ? `${accent}12` : 'white', color: C.ink, fontSize: 13, fontWeight: metricRef === a.ref ? 800 : 600, cursor: 'pointer' }}>
              {metricRef === a.ref ? '● ' : '○ '}{a.label}
            </button>
          ))}
          <button onClick={() => setMetricRef('')}
            style={{ textAlign: 'left', padding: '11px 12px', borderRadius: 10, border: `1.5px solid ${metricRef === '' ? accent : C.border}`, background: metricRef === '' ? `${accent}12` : 'white', color: C.muted, fontSize: 13, fontWeight: metricRef === '' ? 800 : 600, cursor: 'pointer' }}>
            {metricRef === '' ? '● ' : '○ '}Reconhecimento livre (sem métrica)
          </button>
        </div>

        <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Mensagem (opcional)"
          rows={3} style={{ width: '100%', padding: 12, borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 14, resize: 'none', marginBottom: 14, background: 'white', color: C.ink }} />

        <button onClick={send} disabled={sending}
          style={{ width: '100%', padding: '14px 0', borderRadius: 12, background: accent, color: 'white', border: 'none', fontWeight: W.semibold, fontSize: 15, cursor: sending ? 'default' : 'pointer', opacity: sending ? 0.7 : 1 }}>
          {sending ? 'Enviando…' : 'Enviar reconhecimento'}
        </button>
      </div>
    </div>
  );
}

/* --------------------------- Unidades: ranking + ID ------------------------ */


function IndexRing({ value, accent, size = 84 }) {
  const v = Math.max(0, Math.min(100, value ?? 0));
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.border} strokeWidth="8" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={accent} strokeWidth="8"
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - v / 100)} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
        <span className="font-display" style={{ fontSize: 'calc(22px * var(--zc-t-scale))', fontWeight: W.bold, color: C.ink }}>
          {value == null ? '—' : value}
        </span>
      </div>
    </div>
  );
}

/**
 * ID Operacional da UNIDADE. Mesmo conceito da carteirinha do colaborador
 * (`OperationalIdView`), aplicado à loja: identidade, nível, índice, o que
 * compõe o índice, evolução e conquistas.
 */
function UnitIdView({ profile, position, total, accent, sectorRanking = [] }) {
  const p = profile;
  const u = p.unit;
  const color = u.color || accent;

  const Metric = ({ label, value, sub, tone }) => (
    <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: R.md, padding: 14 }}>
      <div style={{ fontSize: T.label, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted }}>{label}</div>
      <div className="font-display" style={{ fontSize: 'calc(26px * var(--zc-t-scale))', fontWeight: W.bold, color: tone || C.ink, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: T.label, color: C.mutedLight, marginTop: 2 }}>{sub}</div>}
    </div>
  );

  const maxWk = Math.max(100, ...p.weekly.map(w => w.rate));

  return (
    <div className="zc-view space-y-4">
      {/* Carteirinha */}
      <section style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: R.md, overflow: 'hidden' }}>
        <div style={{ background: color, color: '#fff', padding: '18px 20px' }}>
          <p style={{ fontSize: T.label, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.85 }}>
            ID Operacional da unidade
          </p>
          <p className="font-display" style={{ fontSize: 'calc(24px * var(--zc-t-scale))', fontWeight: W.bold, marginTop: 4 }}>{u.name}</p>
          <p style={{ fontSize: T.caption, opacity: 0.9, marginTop: 2 }}>
            Nível {p.level} · {position}º de {total} no ranking · últimos {p.windowDays} dias
          </p>
        </div>

        <div style={{ padding: 20, display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          <IndexRing value={p.index} accent={color} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <p style={{ fontSize: T.label, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted }}>
              Índice operacional
            </p>
            <p style={{ fontSize: T.caption, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>
              Média ponderada do que a gestão cobra: aderência pesa 50%, conclusão de
              tarefas 30% e críticos em dia 20%.
            </p>
            <div style={{ marginTop: 10 }}>
              {p.parts.map(part => (
                <div key={part.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
                  <span style={{ fontSize: T.caption, color: C.ink, flex: 1 }}>{part.label}</span>
                  <span style={{ fontSize: T.label, color: C.mutedLight }}>{Math.round(part.weight * 100)}%</span>
                  <span className="font-display" style={{ fontSize: T.bodySm, fontWeight: W.semibold, color: C.ink, width: 44, textAlign: 'right' }}>
                    {part.value == null ? '—' : `${part.value}%`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Progresso de nível */}
        <div style={{ padding: '0 20px 18px' }}>
          <div style={{ height: 6, borderRadius: R.pill, background: C.bg, overflow: 'hidden', border: `1px solid ${C.border}` }}>
            <div style={{ height: '100%', width: `${(p.intoLevel / p.perLevel) * 100}%`, background: color, borderRadius: R.pill }} />
          </div>
          <p style={{ fontSize: T.label, color: C.mutedLight, marginTop: 6 }}>
            {p.intoLevel} de {p.perLevel} checklists para o nível {p.level + 1}
          </p>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2 zc-unit-metrics">
        <Metric label="Aderência" value={p.adherence == null ? '—' : `${p.adherence}%`}
          sub={`${p.checklists} de ${p.expected} previstos`}
          tone={p.adherence == null ? C.ink : p.adherence >= 80 ? C.success : p.adherence >= 50 ? C.warning : C.critical} />
        <Metric label="Tarefas concluídas" value={`${p.taskRate}%`} sub={`${p.evidences} evidências`} />
        {/* Tonaliza pela TAXA, não pela contagem de pendentes: 93% em vermelho
            só porque existem 25 pendentes num universo de 350 lê como alarme
            onde o número é bom. A contagem fica no subtítulo, que é o lugar
            dela. */}
        <Metric label="Críticos em dia" value={p.criticalRate == null ? '—' : `${p.criticalRate}%`}
          sub={p.criticalPending ? `${p.criticalPending} pendente(s)` : 'nenhum pendente'}
          tone={p.criticalRate == null ? C.ink : p.criticalRate >= 95 ? C.success : p.criticalRate >= 80 ? C.warning : C.critical} />
        <Metric label="Sequência" value={`${p.streak} dia${p.streak === 1 ? '' : 's'}`}
          sub={`recorde de ${p.bestStreak} · ${p.operators} pessoa(s)`} />
      </div>

      {p.weekly.length > 0 && (
        <section style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: R.md, padding: 16 }}>
          <h3 style={{ fontSize: T.label, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted }}>
            Evolução · últimas semanas
          </h3>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 90, marginTop: 12 }}>
            {p.weekly.map(w => (
              <div key={w.week} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <span className="font-display" style={{ fontSize: T.label, fontWeight: W.semibold, color: C.muted }}>{w.rate}%</span>
                <div style={{ width: '100%', height: 52, display: 'flex', alignItems: 'flex-end' }}>
                  <div style={{ width: '100%', height: `${Math.max(4, (w.rate / maxWk) * 100)}%`, background: color, borderRadius: '3px 3px 0 0' }} />
                </div>
                <span style={{ fontSize: T.label, color: C.mutedLight }}>
                  {new Date(`${w.week}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {sectorRanking.length > 0 && (
        <section style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: R.md, padding: 16 }}>
          <h3 style={{ fontSize: T.label, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted }}>
            Ranking dos setores
          </h3>
          <p style={{ fontSize: T.caption, color: C.mutedLight, marginTop: 2 }}>
            Mesma régua da unidade, aplicada dentro dela — aderência, tarefas e críticos por setor.
          </p>
          <div style={{ marginTop: 12 }}>
            {sectorRanking.map((sp, i) => (
              <div key={sp.sector} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 0', borderBottom: i < sectorRanking.length - 1 ? `1px solid ${C.border}` : 'none',
              }}>
                <RankBadge pos={i + 1} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: T.bodySm, fontWeight: W.semibold, color: C.ink }}>{sp.sector}</p>
                  <p style={{ fontSize: T.label, color: C.mutedLight, marginTop: 2 }}>
                    {sp.checklists} checklists · aderência {sp.adherence == null ? '—' : `${sp.adherence}%`} ·
                    {' '}tarefas {sp.taskRate}% · críticos {sp.criticalRate == null ? '—' : `${sp.criticalRate}%`}
                  </p>
                  <div style={{ height: 5, borderRadius: R.pill, background: C.bg, marginTop: 6, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${Math.max(2, Math.min(100, sp.index ?? 0))}%`,
                      background: (sp.index ?? 0) >= 80 ? successBright : (sp.index ?? 0) >= 50 ? C.warning : C.critical,
                      borderRadius: R.pill,
                    }} />
                  </div>
                </div>
                <p className="font-display" style={{ fontSize: 'calc(18px * var(--zc-t-scale))', fontWeight: W.bold, color: C.ink, flexShrink: 0 }}>
                  {sp.index == null ? '—' : sp.index}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: R.md, padding: 16 }}>
        <h3 style={{ fontSize: T.label, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted }}>
          Conquistas da unidade
        </h3>
        <div className="grid grid-cols-2 gap-2 zc-unit-metrics" style={{ marginTop: 12 }}>
          {p.achievements.map(a => (
            <div key={a.id} style={{
              border: `1px solid ${a.earned ? `${color}40` : C.border}`,
              background: a.earned ? `${color}0D` : C.bg,
              borderRadius: R.sm, padding: '10px 12px', opacity: a.earned ? 1 : 0.55,
            }}>
              <p style={{ fontSize: T.bodySm, fontWeight: W.semibold, color: a.earned ? C.ink : C.muted }}>{a.title}</p>
              <p style={{ fontSize: T.label, color: C.mutedLight, marginTop: 2 }}>{a.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/**
 * Ranking das unidades. Cada linha abre o ID Operacional daquela unidade — o
 * mesmo gesto que Equipe já usa para abrir a carteirinha de um colaborador.
 */
export function UnidadesView({ units, templates, completions, closures, currentUser, canSeeAllUnits, accent, onBack }) {
  const [selected, setSelected] = useState(null);

  const scoped = useMemo(
    () => (canSeeAllUnits ? units : units.filter(u => u.id === currentUser?.unitId)),
    [units, canSeeAllUnits, currentUser],
  );

  const ranking = useMemo(
    () => scoped
      .map(u => computeUnitProfile(completions, templates, closures, u))
      .sort((a, b) => (b.index ?? -1) - (a.index ?? -1) || b.checklists - a.checklists),
    [scoped, completions, templates, closures],
  );

  if (selected) {
    const idx = ranking.findIndex(r => r.unit.id === selected);
    const prof = ranking[idx];
    if (!prof) return null;
    // Setores da unidade, com a MESMA régua da unidade (computeUnitProfile
    // aceita escopo de setor). Sem componente novo, sem métrica paralela.
    const sectorRanking = (prof.unit.sectors || [])
      .map(sec => computeUnitProfile(completions, templates, closures, prof.unit, 30, sec))
      .filter(sp => sp.checklists > 0 || sp.expected > 0)
      .map(sp => ({
        sector: sp.sector, index: sp.index, adherence: sp.adherence,
        taskRate: sp.taskRate, criticalRate: sp.criticalRate, checklists: sp.checklists,
      }))
      .sort((a, b) => (b.index ?? -1) - (a.index ?? -1));

    return (
      <div>
        <BackBar onBack={() => setSelected(null)} label="Voltar para unidades" accent={accent} />
        <UnitIdView profile={prof} position={idx + 1} total={ranking.length} accent={accent}
          sectorRanking={sectorRanking} />
      </div>
    );
  }

  if (ranking.length === 0) {
    return <div className="zc-view"><EmptyState title="Nenhuma unidade" desc="Cadastre uma loja em Gerenciar › Estrutura." /></div>;
  }

  return (
    <div className="zc-view space-y-3">
      {/* Unidades não está na barra inferior (§D.2: consulta periódica, não uso
          diário), então quem chega pelo "Ver todas as lojas →" do Painel cai
          numa tela sem saída óbvia no celular. `onBack` só é passado com a aba
          consolidada ligada; sem ele, nada muda para a aba de hoje. */}
      {onBack && <BackBar onBack={onBack} label="Voltar para o Painel" accent={accent} />}
      <Eyebrow>Ranking das unidades · últimos 30 dias</Eyebrow>
      <p style={{ fontSize: T.caption, color: C.muted, marginTop: -4 }}>
        Ordenado pelo índice operacional: aderência (50%), tarefas concluídas (30%) e críticos em dia (20%).
      </p>

      {ranking.map((p, i) => (
        <button key={p.unit.id} onClick={() => setSelected(p.unit.id)}
          aria-label={`Abrir ID operacional de ${p.unit.name}`}
          style={{
            width: '100%', textAlign: 'left', background: '#fff', border: `1px solid ${C.border}`,
            borderLeft: `4px solid ${p.unit.color || accent}`, borderRadius: R.md,
            padding: '14px 16px', cursor: 'pointer', fontFamily: 'inherit', display: 'block',
          }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <RankBadge pos={i + 1} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p className="font-display" style={{ fontSize: 'calc(17px * var(--zc-t-scale))', fontWeight: W.semibold, color: C.ink }}>{p.unit.name}</p>
              <p style={{ fontSize: T.label, color: C.mutedLight, marginTop: 2 }}>
                Nível {p.level} · {p.checklists} checklists · {p.operators} pessoa(s)
                {p.criticalPending ? ` · ${p.criticalPending} crítico(s) pendente(s)` : ''}
              </p>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <p className="font-display" style={{ fontSize: 'calc(22px * var(--zc-t-scale))', fontWeight: W.bold, color: C.ink }}>
                {p.index == null ? '—' : p.index}
              </p>
              <p style={{ fontSize: T.label, color: C.mutedLight }}>índice</p>
            </div>
            <ChevronRight size={18} color={C.mutedLight} style={{ flexShrink: 0 }} />
          </div>

          <div style={{ display: 'flex', gap: 14, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}`, flexWrap: 'wrap' }}>
            {[['Aderência', p.adherence], ['Tarefas', p.taskRate], ['Críticos', p.criticalRate]].map(([label, v]) => (
              <div key={label} style={{ flex: 1, minWidth: 88 }}>
                <p style={{ fontSize: T.label, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.05em', color: C.mutedLight }}>{label}</p>
                <p className="font-display" style={{ fontSize: T.bodySm, fontWeight: W.semibold, color: C.ink, marginTop: 2 }}>
                  {v == null ? '—' : `${v}%`}
                </p>
              </div>
            ))}
          </div>
        </button>
      ))}
    </div>
  );
}

export function EquipeView({ currentUser, users, completions, templates, closures, accent, canSeeAllUnits }) {
  const [selected, setSelected] = useState(null);
  const [recognizeFor, setRecognizeFor] = useState(null);
  const [toast, setToast] = useState('');

  const units = useUnits();
  const [groupBy, setGroupBy] = useState('unidade'); // 'unidade' | 'setor' | 'lideranca'
  /**
   * O período do ranking. Só existe aqui, e é de propósito: a aba Equipe é
   * visível apenas para liderança (ROLE_TABS) e é onde se ANALISA. O Painel,
   * que o colaborador também vê, fica fixo no mês — dois lugares com seletores
   * independentes gerariam de novo o problema de "qual dos dois vale".
   *
   * Mensal é o padrão pelo mesmo motivo do Painel: placar que recomeça no dia
   * 1º fomenta constância, janela deslizante dilui o passado sozinha.
   */
  // Mesmos nomes e mesmos defaults da aba Dados — inclusive o "Mês" como
  // padrão, que é o pedido: placar que recomeça no dia 1º fomenta constância.
  const equipeTz = tzOfUnit(units, currentUser?.unitId);
  const [periodId, setPeriodId] = useState(RANKING_PERIOD_DEFAULT);
  const [selectedMonth, setSelectedMonth] = useState(() => todayStr(equipeTz).slice(0, 7));
  const [customFrom, setCustomFrom] = useState(() => todayStr(equipeTz));
  const [customTo, setCustomTo] = useState(() => todayStr(equipeTz));
  const periodo = useMemo(
    () => rankingPeriod(periodId, equipeTz, completions, { mes: selectedMonth, from: customFrom, to: customTo }),
    [periodId, equipeTz, completions, selectedMonth, customFrom, customTo],
  );

  /**
   * Liderança entra no ranking junto com o colaborador: quem lidera a loja
   * também executa checklist, e deixar essa execução fora dava um quadro
   * incompleto da unidade. Gerência e diretoria continuam fora — não têm
   * unidade fixa, apareceriam em todas as unidades de uma vez.
   */
  const people = useMemo(() => {
    const list = (users || []).filter(u => RANKED_ROLES.includes(u.role) && !u.suspended);
    return canSeeAllUnits ? list : list.filter(u => u.unitId === currentUser.unitId);
  }, [users, canSeeAllUnits, currentUser]);

  // Ordena pelo ÍNDICE, não por volume: quem faz mais não é necessariamente quem
  // faz melhor, e ordenar por tarefas premiava só quem pegou mais turno.
  /**
   * `onlyActive` distingue os dois agrupamentos, e a diferença é de significado:
   * a UNIDADE é um quadro de pessoas — quem não executou nada no período precisa
   * aparecer, porque "quem não apareceu" é informação de gestão. O SETOR não é
   * quadro nenhum: listar ali quem nunca trabalhou naquele setor seria ruído.
   */
  const rank = (scopeCompletions, candidates, onlyActive) => candidates
    .map(u => ({ user: u, profile: computeOperationalProfile(scopeCompletions, u.id, u.name, tzOfUnit(units, u.unitId), templates, units, periodo) }))
    .filter(x => !onlyActive || x.profile.checklists > 0 || x.profile.tasksDone > 0)
    .sort((a, b) => (b.profile.index ?? -1) - (a.profile.index ?? -1)
      || b.profile.tasksDone - a.profile.tasksDone
      || b.profile.checklists - a.profile.checklists);

  /**
   * Os grupos saem de ONDE a pessoa executou, não do `sectorId` cadastrado.
   * Dois motivos: o cadastro raramente tem setor preenchido, e uma pessoa
   * executa em mais de um setor no mesmo turno — o dado real está em
   * `completion.sector`.
   */
  const groups = useMemo(() => {
    const unitsInScope = canSeeAllUnits ? units : units.filter(u => u.id === currentUser?.unitId);
    const out = [];
    if (groupBy === 'lideranca') return out;   // outro ranking, montado abaixo
    unitsInScope.forEach(u => {
      const ofUnit = (completions || []).filter(c => c.unitId === u.id);
      if (groupBy === 'unidade') {
        const rows = rank(ofUnit, people.filter(pp => !pp.unitId || pp.unitId === u.id), false);
        if (rows.length) out.push({ key: u.id, title: u.name, sub: 'todos os setores', color: u.color, rows });
        return;
      }
      const seen = [...new Set(ofUnit.map(c => c.sector).filter(Boolean))];
      const order = (u.sectors || []).filter(sec => seen.includes(sec)).concat(seen.filter(sec => !(u.sectors || []).includes(sec)));
      order.forEach(sec => {
        const ofSector = ofUnit.filter(c => c.sector === sec);
        const rows = rank(ofSector, people.filter(pp => !pp.unitId || pp.unitId === u.id), true);
        if (rows.length) out.push({ key: `${u.id}|${sec}`, title: sec, sub: u.name, color: u.color, rows });
      });
    });
    return out;
  }, [units, people, completions, groupBy, canSeeAllUnits, currentUser, periodo, templates]);

  /**
   * Ranking da LIDERANÇA — régua diferente da do colaborador, porque o trabalho
   * é outro: não é o que a pessoa executou, é o que a equipe dela entregou.
   * Ver `computeLeadershipProfile` para os pesos e as duas regras que impedem
   * autoconferência inflar a nota.
   *
   * Quem entra: liderança, gerência e diretoria. Diferente do ranking de
   * pessoas, gerência e diretoria cabem aqui — elas respondem pela empresa
   * inteira, e "empresa inteira" é um escopo bem definido, não uma linha
   * repetida em toda loja.
   */
  const leaders = useMemo(() => {
    if (groupBy !== 'lideranca') return [];
    const unitsInScope = canSeeAllUnits ? units : units.filter(u => u.id === currentUser?.unitId);
    // Ranking de liderança lado a lado precisa de uma régua só, senão duas
    // lojas em fusos diferentes competiriam em janelas deslocadas.
    const today = todayStr(tzOfUnit(units, currentUser?.unitId));
    const scopeIds = new Set(unitsInScope.map(u => u.id));
    return (users || [])
      .filter(u => MANAGER_ROLES.includes(u.role) && !u.suspended)
      // Um líder de outra loja não interessa a quem só enxerga a própria; já
      // gerência/diretoria (sem unitId) respondem por todas, então aparecem
      // sempre que quem olha enxerga a empresa toda.
      .filter(u => (u.unitId ? scopeIds.has(u.unitId) : canSeeAllUnits))
      .map(u => ({
        user: u,
        profile: computeLeadershipProfile({
          completions, templates, closures, units: unitsInScope, leader: u, today, periodo,
        }),
      }))
      .sort((a, b) => (b.profile.index ?? -1) - (a.profile.index ?? -1)
        || b.profile.teamChecklists - a.profile.teamChecklists);
  // `today` NÃO entra aqui: ele é declarado dentro do callback, então citá-lo
  // no array de dependências é um ReferenceError em runtime — que o build não
  // pega, porque isto é JS puro sem checagem de variável não declarada. Ele
  // deriva de `units` e `currentUser`, que já estão na lista.
  }, [groupBy, users, completions, templates, closures, units, canSeeAllUnits, currentUser, periodo]);

  // Perfil do colaborador selecionado (visão do líder)
  if (selected) {
    return (
      <div>
        <BackBar onBack={() => setSelected(null)} label="Voltar para a equipe" accent={accent} />
        <OperationalIdView
          targetUser={selected} viewer={currentUser} completions={completions} templates={templates} accent={accent}
          onRecognize={profile => setRecognizeFor({ user: selected, profile })}
        />
        {recognizeFor && (
          <RecognizeModal
            target={recognizeFor.user} profile={recognizeFor.profile}
            currentUser={currentUser} unitId={selected.unitId} companyId={currentUser.companyId} accent={accent}
            onClose={() => setRecognizeFor(null)}
            onSent={ok => { setRecognizeFor(null); setToast(ok ? 'Reconhecimento enviado' : 'Não foi possível enviar agora.'); setTimeout(() => setToast(''), 2500); }}
          />
        )}
        {toast && (
          <div className="zc-overlay" style={{ position: 'fixed', bottom: 'calc(var(--zc-nav-h) + 16px + env(safe-area-inset-bottom, 0px))', left: 16, right: 16, zIndex: 220, background: C.ink, color: 'white', borderRadius: 12, padding: '12px 16px', textAlign: 'center', fontSize: 13, fontWeight: W.semibold }}>{toast}</div>
        )}
      </div>
    );
  }

  // Lista da equipe
  return (
    <div style={{ padding: '14px 14px 28px' }}>
      <Eyebrow>
        {groupBy === 'lideranca' ? 'Ranking da liderança · medido pela equipe' : 'Ranking da equipe · reconheça pelo desempenho'}
      </Eyebrow>
      <p style={{ fontSize: T.caption, color: C.muted, margin: '4px 0 10px' }}>
        {groupBy === 'lideranca'
          ? `Índice de liderança de ${periodo.label}: checklists da equipe no prazo (40%), aderência ao previsto (30%) e execuções conferidas por ele (30%).`
          : `Ordenado pelo índice operacional de ${periodo.label}: ${collabIndexSentence()}.`}
      </p>

      <div className="flex gap-2" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
        <PillButton active={groupBy === 'unidade'} accent={accent} onClick={() => setGroupBy('unidade')}>Por unidade</PillButton>
        <PillButton active={groupBy === 'setor'} accent={accent} onClick={() => setGroupBy('setor')}>Por setor</PillButton>
        <PillButton active={groupBy === 'lideranca'} accent={accent} onClick={() => setGroupBy('lideranca')}>Liderança</PillButton>
      </div>

      {/* Período — vale para os DOIS rankings desta aba. Antes só o do
          colaborador respeitava o seletor e o da liderança ficava preso em 30
          dias: a mesma tela responderia sobre períodos diferentes conforme a
          aba interna, que é o defeito que este seletor existe para não ter. */}
      {(
        <>
          <p style={{ fontSize: T.label, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.05em', color: C.mutedLight, marginBottom: 6 }}>
            Período
          </p>
          {/* O seletor da aba Dados, inteiro: mesmas opções, mesmos controles,
              mesmos limites de data. Quem já escolhe período lá não aprende
              nada novo aqui. */}
          <div className="flex flex-wrap gap-2" style={{ marginBottom: 8 }}>
            {PERIODS.map(p => (
              <PillButton key={p.id} active={periodId === p.id} accent={accent} onClick={() => setPeriodId(p.id)}>
                {p.label}
              </PillButton>
            ))}
          </div>

          {periodId === 'month' && (
            <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
              <input
                type="month" value={selectedMonth} max={todayStr(equipeTz).slice(0, 7)}
                onChange={e => setSelectedMonth(e.target.value)}
                aria-label="Mês do ranking"
                style={{ flex: 1, fontSize: 13, fontWeight: W.semibold, color: C.ink, background: 'white', padding: '8px 10px', border: `1.5px solid ${accent}`, borderRadius: 8, outline: 'none' }}
              />
              {selectedMonth && (
                <span style={{ fontSize: 12, color: C.muted, fontWeight: W.semibold }}>{periodo.label}</span>
              )}
            </div>
          )}

          {periodId === 'custom' && (
            <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
              <input
                type="date" value={customFrom} max={customTo} onChange={e => setCustomFrom(e.target.value)}
                aria-label="Início do período"
                style={{ flex: 1, fontSize: 13, fontWeight: W.semibold, color: C.ink, background: 'white', padding: '8px 8px', border: `1.5px solid ${C.border}`, borderRadius: 8, outline: 'none' }}
              />
              <span style={{ fontSize: 12, color: C.muted, fontWeight: W.semibold }}>até</span>
              <input
                type="date" value={customTo} min={customFrom} max={todayStr(equipeTz)} onChange={e => setCustomTo(e.target.value)}
                aria-label="Fim do período"
                style={{ flex: 1, fontSize: 13, fontWeight: W.semibold, color: C.ink, background: 'white', padding: '8px 8px', border: `1.5px solid ${C.border}`, borderRadius: 8, outline: 'none' }}
              />
            </div>
          )}
        </>
      )}

      {groupBy === 'lideranca' && (
        leaders.length === 0 ? (
          <EmptyState title="Nenhuma liderança no seu escopo"
            desc="O ranking mede liderança, gerência e diretoria pelo resultado da equipe. Cadastre alguém nesses papéis para ele aparecer aqui." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {leaders.map(({ user, profile }, i) => {
              const escopo = user.unitId
                ? (units.find(u => u.id === user.unitId)?.name || 'loja')
                : 'todas as lojas';
              return (
                <div key={user.id} style={{
                  background: 'white', borderRadius: R.md, border: `1px solid ${C.border}`,
                  borderLeft: `4px solid ${accent}`, padding: '14px 16px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <RankBadge pos={i + 1} />
                    <Avatar user={user} size={36} bg={`${accent}18`} fg={accent} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p className="font-display" style={{ fontSize: 'calc(17px * var(--zc-t-scale))', fontWeight: W.semibold, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}</p>
                      <p style={{ fontSize: T.label, color: C.mutedLight, marginTop: 2 }}>
                        {ROLE_LABELS[user.role] || user.role} · {escopo} · {profile.teamChecklists} checklists da equipe
                      </p>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <p className="font-display" style={{ fontSize: 'calc(22px * var(--zc-t-scale))', fontWeight: W.bold, color: C.ink }}>
                        {profile.index == null ? '—' : profile.index}
                      </p>
                      <p style={{ fontSize: T.label, color: C.mutedLight }}>índice</p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 14, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}`, flexWrap: 'wrap' }}>
                    {profile.parts.map(part => (
                      <div key={part.key} style={{ flex: 1, minWidth: 88 }}>
                        <p style={{ fontSize: T.label, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.05em', color: C.mutedLight }}>{part.label}</p>
                        <p className="font-display" style={{ fontSize: T.bodySm, fontWeight: W.semibold, color: C.ink, marginTop: 2 }}>
                          {part.value == null ? '—' : `${part.value}%`}
                        </p>
                        {/* O número bruto embaixo do percentual: "80%" sozinho
                            não diz se são 4 de 5 ou 400 de 500, e a diferença
                            muda o que a gestão faz com a informação. */}
                        <p style={{ fontSize: T.label, color: C.mutedLight, marginTop: 1 }}>
                          {part.key === 'prazo' && (profile.onTimeTotal ? `${profile.onTimeDone}/${profile.onTimeTotal}` : 'sem prazo definido')}
                          {part.key === 'aderencia' && (profile.expected ? `${profile.doneChecklists}/${profile.expected}` : 'nada previsto')}
                          {part.key === 'conferidos' && (profile.reviewable ? `${profile.reviewedByMe}/${profile.reviewable}` : 'nada a conferir')}
                        </p>
                      </div>
                    ))}
                  </div>

                  {profile.pending > 0 && (
                    <p style={{ fontSize: T.label, color: C.warning, fontWeight: W.semibold, marginTop: 8 }}>
                      {profile.pending} execuç{profile.pending === 1 ? 'ão' : 'ões'} aguardando conferência · Relatórios → Execuções do período
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}

      {groupBy === 'lideranca' ? null : groups.length === 0 ? (
        <EmptyState title="Ninguém na equipe" desc="Não há colaboradores nem liderança ativos com execuções no seu escopo." />
      ) : groups.map(g => (
        <div key={g.key} style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: R.pill, background: g.color || accent, flexShrink: 0 }} />
            <h3 className="font-display" style={{ fontSize: 'calc(17px * var(--zc-t-scale))', fontWeight: W.semibold, color: C.ink }}>{g.title}</h3>
            <span style={{ fontSize: T.label, color: C.mutedLight }}>{g.sub} · {g.rows.length} pessoa{g.rows.length === 1 ? '' : 's'}</span>
          </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {g.rows.map(({ user, profile }, i) => (
            <button key={user.id} onClick={() => { setSelected(user); }}
              aria-label={`Abrir ID operacional de ${user.name}`}
              style={{
                width: '100%', textAlign: 'left', background: 'white', borderRadius: R.md,
                border: `1px solid ${C.border}`, borderLeft: `4px solid ${g.color || accent}`,
                padding: '14px 16px', cursor: 'pointer', fontFamily: 'inherit', display: 'block',
              }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <RankBadge pos={i + 1} />
                <Avatar user={user} size={36} bg={`${accent}18`} fg={accent} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <p className="font-display" style={{ fontSize: 'calc(17px * var(--zc-t-scale))', fontWeight: W.semibold, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}</p>
                    {/* O ranking mistura papéis desde que liderança entrou nele —
                        sem a etiqueta não dá para saber quem é quem na lista. */}
                    {user.role !== 'colaborador' && (
                      <span style={{
                        flexShrink: 0, fontSize: T.label, fontWeight: W.semibold, textTransform: 'uppercase',
                        letterSpacing: '0.05em', color: ROLE_COLORS[user.role] || C.muted,
                        background: `${ROLE_COLORS[user.role] || C.muted}14`, borderRadius: R.pill, padding: '2px 8px',
                      }}>{ROLE_LABELS[user.role] || user.role}</span>
                    )}
                  </div>
                  <p style={{ fontSize: T.label, color: C.mutedLight, marginTop: 2 }}>
                    {profile.checklists === 0 && profile.tasksDone === 0
                      ? 'Sem execuções no período'
                      : `Nível ${profile.level} · ${profile.checklists} checklists · ${profile.tasksDone} tarefas${profile.streak ? ` · ${profile.streak} dia${profile.streak === 1 ? '' : 's'} seguidos` : ''}`}
                  </p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p className="font-display" style={{ fontSize: 'calc(22px * var(--zc-t-scale))', fontWeight: W.bold, color: C.ink }}>
                    {profile.index == null ? '—' : profile.index}
                  </p>
                  <p style={{ fontSize: T.label, color: C.mutedLight }}>índice</p>
                </div>
                <ChevronRight size={18} color={C.mutedLight} style={{ flexShrink: 0 }} />
              </div>

              {/* A linha de cima são CONTADORES DE HISTÓRIA (nível, total de
                  checklists, sequência). Daqui para baixo é a JANELA do índice.
                  Sem esta divisória escrita, "21 checklists" ao lado de
                  "Conclusão 100%" faz parecer que os dois falam do mesmo
                  período — e não falam. */}
              <p style={{ fontSize: T.label, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.05em', color: C.mutedLight, marginTop: 10 }}>
                Índice · {profile.periodLabel} · {profile.checklistsJanela} checklist{profile.checklistsJanela === 1 ? '' : 's'}
              </p>
              <div style={{ display: 'flex', gap: 14, marginTop: 6, paddingTop: 8, borderTop: `1px solid ${C.border}`, flexWrap: 'wrap' }}>
                {/* Os mesmos componentes do índice, na mesma ordem de peso —
                    quem lê o card tem que conseguir ligar o número grande da
                    direita às partes que o formaram. `No prazo` leva os brutos
                    junto porque um atraso em 3 entregas pesa muito diferente de
                    um atraso em 30. */}
                {[
                  ['Conclusão', profile.avgRate, null],
                  ['No prazo', profile.punctuality, profile.prazoTotal ? `${profile.prazoOk}/${profile.prazoTotal}` : 'sem prazo'],
                  ['Críticos', profile.criticalRate, null],
                  ['Constância', profile.checklists ? profile.consistency : null, null],
                ].map(([label, v, sub]) => (
                  <div key={label} style={{ flex: 1, minWidth: 76 }}>
                    <p style={{ fontSize: T.label, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.05em', color: C.mutedLight }}>{label}</p>
                    <p className="font-display" style={{ fontSize: T.bodySm, fontWeight: W.semibold, color: C.ink, marginTop: 2 }}>
                      {v == null ? '—' : `${v}%`}
                    </p>
                    {sub && <p style={{ fontSize: T.label, color: C.mutedLight }}>{sub}</p>}
                  </div>
                ))}
              </div>
            </button>
          ))}
        </div>
        </div>
      ))}
    </div>
  );
}

function AppInner() {
  const { isOnline, pendingSync, syncing } = useNetworkStatus();
  // Nasce nulo: a unidade ativa é derivada de ACTIVE_UNITS (as da própria
  // empresa). Antes o default era 'ibr1' — uma loja do IBR, em todo tenant.
  const [unitId, setUnitId] = useState(null);
  const [tab, setTab] = useState('executar');
  const [templates, setTemplates] = useState(null);
  const [completions, setCompletions] = useState(null);
  const [users, setUsers] = useState(null);
  const [closures, setClosures] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [showPlans, setShowPlans] = useState(false);   // painel de assinatura (modal)
  const [showNudge, setShowNudge] = useState(false);   // nudge dispensável do trial
  const [generatingTestData, setGeneratingTestData] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  const [showRequestsPopup, setShowRequestsPopup] = useState(false);
  // Reconhecimentos recebidos e ainda não vistos. Mesma ideia do aviso de
  // solicitação pendente do gestor, do outro lado da relação: o gestor é
  // avisado de quem quer entrar, o colaborador de quem o elogiou.
  const [newRecognitions, setNewRecognitions] = useState([]);
  const [showRecognitionPopup, setShowRecognitionPopup] = useState(false);
  const [popupMinimized, setPopupMinimized] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showCompanyOnboarding, setShowCompanyOnboarding] = useState(false);
  const [showTour, setShowTour] = useState(false); // tour guiado pós-onboarding
  const [showJit, setShowJit] = useState(false);
  const [jitSource, setJitSource] = useState('auto');

  // ── Multi-tenant company data ──────────────────────────────────────────────
  const [company, setCompany] = useState(null);
  const [dynamicUnits, setDynamicUnits] = useState([]);
  const [dynamicSectors, setDynamicSectors] = useState([]);
  const [dynamicTypes, setDynamicTypes] = useState([]);

  // Fuso da loja em foco — o "hoje" de tudo que o app decide por dia (briefing
  // já visto, chave de localStorage, data do plano de ação). Declarado aqui em
  // cima porque esses usos vêm antes de `unit` ser resolvido, lá no render.
  // Loja não escolhida ainda → a do cadastro do usuário → default de lib/dates.
  const appTz = tzOfUnit(dynamicUnits, unitId ?? currentUser?.unitId);

  // ── Sessão ────────────────────────────────────────────────────────────────
  // Abre a sessão no app. Serve tanto ao login por PIN (LoginScreen) quanto à
  // restauração da sessão persistida no mount — o caminho que mantém o app
  // usável offline depois de um reload (ver loadPersistedSession).
  const handleLogin = (u, { restored = false } = {}) => {
    setCacheScope(u.companyId || u.company_id || null);
    setCurrentUser(u);
    setUnitId(u.unitId || null);
    setTab(ROLE_TABS[u.role][0]);

    // Instrumentação: abre a sessão de tracking e registra o login.
    setTrackSession(u);
    track('login', { source: restored ? 'restore' : 'login', metadata: { role: u.role, restored } });

    // O mount já buscou estes metadados a partir do slug do subdomínio.
    // Só refaz a busca se ela não deu resultado — o caso em que o slug do
    // host difere do companies.id do usuário.
    const needsTenantData = !company || dynamicUnits.length === 0;
    if (needsTenantData && (u.companyId || u.company_id)) {
      const cid = u.companyId || u.company_id;
      Promise.all([
        fetchCompany(null, cid),
        fetchUnits(cid),
        fetchSectors(cid),
        fetchChecklistTypes(cid),
      ]).then(([co, units, sectors, types]) => {
        if (co) setCompany(co);
        if (units.length) {
          setDynamicUnits(units.map(u => ({
            id: u.id, name: u.name, color: u.color, timezone: u.timezone,
            sectors: sectors.filter(s => s.unit_id === u.id).map(s => s.name),
          })));
        }
        setDynamicSectors(sectors);
        setDynamicTypes(types);
      });
    }
    // Check first access — show welcome screen for colaborador and lideranca
    if (u.role === 'colaborador' || u.role === 'lideranca') {
      const key = `ibr_welcomed_${u.id}`;
      try {
        const already = localStorage.getItem(key);
        if (!already) {
          setShowWelcome(true);
          localStorage.setItem(key, '1');
        }
      } catch(_) {}
    }
    // Request push permission directly — OS shows its own native prompt
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      // Só tenta se o navegador puder — no iOS em aba normal isso lançava um
      // pedido que morria em silêncio a cada login.
      setTimeout(() => {
        if (pushDiagnosis().blocked) return;
        requestPushPermission(u).then(sub => setPushEnabled(!!sub));
      }, 1000);
    }
    // Track presence
    import('../../lib/supabase').then(({ supabase }) => {
      const ch = supabase.channel('presence:users', { config: { presence: { key: u.id } } });
      ch.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await ch.track({ user_id: u.id, online_at: new Date().toISOString() });
        }
      });
    }).catch(() => {});
  };

  const doLogout = async () => {
    clearTrackSession();
    // Revoga a credencial (memória + cópia persistida): sem isto o token e o
    // socket de realtime continuam autenticados como quem acabou de sair.
    await setSessionToken(null);
    setCurrentUser(null);
  };

  // Restaura a sessão persistida no mount. É o que permite abrir o app sem
  // internet: o PIN só é exigido quando não há sessão válida no aparelho.
  useEffect(() => {
    const sess = loadPersistedSession();
    if (!sess) return;
    setSessionToken(sess.token);
    handleLogin(sess.user, { restored: true });
  }, []);

  // Revalidação online: troca o token por um novo via /api/auth/refresh toda
  // vez que o app abre (ou a conexão volta) com sessão ativa. É o contrapeso
  // do TTL de 7 dias — suspensão e empresa desativada derrubam a sessão na
  // primeira abertura conectada. Erros de rede mantêm o token atual.
  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    const refresh = async () => {
      const token = getSessionToken();
      if (!token || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
      try {
        const res = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled) return;
        if (res.status === 401 || res.status === 403) {
          // Sessão inválida, suspensa ou empresa desativada: encerra de fato.
          await doLogout();
          return;
        }
        const data = await res.json().catch(() => null);
        if (!cancelled && data?.ok && data.token) {
          await setSessionToken(data.token);
          persistSession(data.token, data.user || currentUser);
        }
      } catch (_) { /* offline ou erro transitório: segue com o token atual */ }
    };
    refresh();
    const onOnline = () => refresh();
    window.addEventListener('online', onOnline);
    return () => { cancelled = true; window.removeEventListener('online', onOnline); };
  }, [currentUser?.id]);

  // Instrumentação: uma abertura de app por visita, antes mesmo do login.
  // O tenant ainda não está resolvido aqui — o hostname (subdomínio) identifica
  // a empresa no /admin; o session_id liga esta abertura ao login que vier.
  useEffect(() => {
    track('app_opened', {
      source: 'app',
      metadata: { host: typeof window !== 'undefined' ? window.location.hostname : null },
    });
  }, []);

  // Active UNITS — dynamic when loaded from DB, fallback to hardcoded for IBR
  const ACTIVE_UNITS = dynamicUnits.length > 0 ? dynamicUnits : UNITS;

  // Aba e loja na URL. Precisa ficar AQUI, acima dos returns antecipados de
  // carregamento (LoadingScreen, login, paywall) — hook não pode vir depois de
  // return condicional. `ready` segura a aplicação da URL até o papel existir:
  // sem isso, o link de um gestor abriria uma aba que o colaborador não pode ver.
  const urlAllowedTabs = useMemo(
    () => (currentUser ? ROLE_TABS[currentUser.role] : []),
    [currentUser],
  );
  const urlUnitIds = useMemo(() => ACTIVE_UNITS.map(u => u.id), [ACTIVE_UNITS]);
  useAppUrlState({
    ready: !!currentUser,
    tab, setTab, allowedTabs: urlAllowedTabs,
    unitId, setUnitId,
    canSwitchUnit: currentUser ? currentUser.unitId == null : false,
    unitIds: urlUnitIds,
  });

  // Active checklist types — dynamic when loaded, fallback to hardcoded.
  // Os tipos-padrão que NÃO existem no banco entram no fim: empresa antiga (IBR,
  // sem typeRows) que criar um tipo livre não pode perder Abertura/Intermediário/
  // Fechamento do Executar — antes o fallback era tudo-ou-nada (corrigido 20/07).
  const ACTIVE_TYPES = dynamicTypes.length > 0
    ? [
        ...dynamicTypes.map(t => ({
          key: t.id,
          label: t.name,
          match: tpl => tpl.name.toLowerCase().includes(t.name.toLowerCase()),
        })),
        // Tipo-padrão que a empresa NÃO cadastrou só entra se ela já tiver
        // checklist com esse nome. Sem essa condição, "Intermediário" aparecia
        // em Gerenciar para quem nunca o criou (só Abertura e Fechamento em
        // Estrutura > Tipos) — o fallback existe para a empresa legada, que tem
        // os checklists mas não tem as linhas em `checklist_types`.
        ...CHECKLIST_TYPE_ORDER.filter(std => {
          const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          const root = std.key === 'intermediario' ? 'intermedi' : norm(std.label);
          if (dynamicTypes.some(d => norm(d.name).includes(root))) return false;
          return (templates || []).some(t => norm(t.name).includes(root));
        }),
      ]
    : CHECKLIST_TYPE_ORDER;

  // ── Onboarding guiado (Fase 2) ─────────────────────────────────────────────
  // Gestor/gerência de empresa nova (nenhum checklist ainda, fora o IBR): abre o
  // fluxo de boas-vindas que cria os checklists prontos do segmento escolhido.
  // Some sozinho assim que existir o primeiro checklist.
  useEffect(() => {
    if (!currentUser || !templates) return;
    const isIbr = (currentUser.companyId || currentUser.company_id) === 'ibr';
    if (isIbr || !['gerencia', 'gestao'].includes(currentUser.role)) return;
    if (templates.length > 0) { setShowCompanyOnboarding(false); return; }
    try { if (localStorage.getItem(`zc_company_onboarding_${currentUser.id}`)) return; } catch (_) {}
    setShowCompanyOnboarding(true);
  }, [currentUser, templates]);

  // ── Daily J.I.T. (H1) ────────────────────────────────────────────────────
  const jit = useMemo(() => {
    if (!templates || !completions) return null;
    const activeUnits = dynamicUnits.length > 0 ? dynamicUnits : UNITS;
    // Segue a unidade SELECIONADA no cabeçalho, não a do cadastro do usuário.
    // Antes era `currentUser.unitId`, que para gestão é sempre nulo — por isso
    // clicar numa loja não mudava nada: o J.I.T. seguia mostrando a empresa
    // toda. Quem é preso a uma unidade (liderança) continua preso a ela.
    const scope = currentUser?.unitId ?? unitId ?? null;
    // Escopo "rede inteira" não tem um dia único quando as lojas estão em fusos
    // diferentes; a loja em foco (ou a primeira) define o "hoje" da tela.
    const base = unitId ?? activeUnits[0]?.id ?? null;
    return buildJit(completions, templates, closures || [], activeUnits, scope, base);
  }, [templates, completions, closures, dynamicUnits, currentUser?.unitId, unitId]);

  // ── Action plans (H1) — a memória do J.I.T. entre dias ──────────────────
  // Declarado ANTES do efeito de auto-abertura, que decide com base nos planos.
  const [actionPlans, setActionPlans] = useState([]);
  const [plansLoaded, setPlansLoaded] = useState(false);
  useEffect(() => {
    if (!currentUser || !MANAGER_ROLES.includes(currentUser.role)) { setPlansLoaded(false); return; }
    fetchActionPlans(currentUser.id).then(p => { setActionPlans(p); setPlansLoaded(true); });
  }, [currentUser?.id]);

  const handleCreatePlan = async rec => {
    const plan = await createActionPlan({
      jitDate: todayStr(appTz),
      recId: rec.id, recType: rec.type, recText: rec.text,
      unitId: rec.unitId || null,
      createdBy: currentUser.id, createdByName: currentUser.name,
    });
    if (plan) setActionPlans(prev => [...prev, plan]);
    return plan;
  };
  const handleCompletePlan = async plan => {
    const ok = await completeActionPlan(plan.id, currentUser.id);
    if (ok) setActionPlans(prev => prev.filter(p => p.id !== plan.id));
    return ok;
  };

  // Sinal real = recomendação além do fallback, insight não-estável, ou plano
  // aberto cobrando resolução. Recalcula ao vivo (completions chegam por
  // realtime), então sinal que surge no meio do dia acende o badge do botão.
  const jitHasSignal = useMemo(() => {
    if (!jit) return false;
    return jit.recommendations.some(r => r.type !== 'all_good') ||
      (!!jit.insight && jit.insight.type !== 'stable') ||
      actionPlans.some(p => p.jitDate !== jit.date);
  }, [jit, actionPlans]);

  // "Já viu o J.I.T. hoje?" — espelha o marcador de localStorage em estado,
  // para o badge do botão apagar assim que o gestor fechar o modal.
  const [jitSeenToday, setBriefingSeenToday] = useState(false);
  useEffect(() => {
    if (!currentUser) { setBriefingSeenToday(false); return; }
    try { setBriefingSeenToday(!!localStorage.getItem(`zc_jit_seen_${currentUser.id}_${todayStr(appTz)}`)); }
    catch (_) { setBriefingSeenToday(false); }
    // `appTz` entra nas deps porque as lojas chegam DEPOIS do primeiro render:
    // sem ele a chave ficaria carimbada com o dia de Brasília para sempre.
  }, [currentUser?.id, appTz]);

  // Popup de assinatura durante o teste: só gestão, TODA entrada no app
  // (pedido 18/07 — antes era 1×/dia), uma vez por login, com um pequeno
  // respiro para o app terminar de montar. Direciona para a escolha de plano.
  const nudgeShownFor = useRef(null);
  useEffect(() => {
    if (!currentUser || currentUser.role !== 'gestao' || !company) return;
    if (billingState(company).state !== 'trialing') return;
    if (nudgeShownFor.current === currentUser.id) return;
    nudgeShownFor.current = currentUser.id;
    const t = setTimeout(() => setShowNudge(true), 1200);
    return () => clearTimeout(t);
  }, [currentUser?.id, company]);

  // Abre automaticamente 1×/dia para papéis de gestão — MAS só quando há sinal
  // real. Takeover em dia de "tudo certo" treina o gestor a fechar no reflexo,
  // e esse condicionamento não se desfaz (anti-fadiga, revisão de produto).
  // O botão manual continua sempre lá; abrir por vontade própria (source=
  // manual) é o sinal-ouro de hábito que o H1 mede.
  const autoOpenChecked = useRef(null);
  useEffect(() => {
    if (!currentUser || !MANAGER_ROLES.includes(currentUser.role)) return;
    if (!jit || !plansLoaded) return;
    // Já está no Painel? A seção AGORA é a primeira dobra dele, então o pop-up
    // abriria por cima exatamente do mesmo conteúdo. Não abre.
    //
    // Mas NÃO carimba o "visto do dia" daqui. Quem carimba é a própria seção
    // AGORA, quando ela renderiza (`SecaoAgora`) — que é o instante em que o
    // briefing foi de fato visto. A diferença não é teórica: `plansLoaded` chega
    // por fetch, e carimbar aqui significa que abrir o Painel enquanto os planos
    // ainda vinham matava o pop-up pelo resto do dia. Antes da consolidação o
    // ramo era `tab === 'jit'`, um destino raro e deliberado; `painel` é o
    // destino padrão de quem é gestão, e carimbar nele é carimbar sempre.
    if (tab === 'painel') return;
    // Uma avaliação por login: sinal que surgir depois não toma a tela no meio
    // do trabalho — acende o badge do botão manual em vez de interromper.
    if (autoOpenChecked.current === currentUser.id) return;
    autoOpenChecked.current = currentUser.id;
    try {
      const key = `zc_jit_seen_${currentUser.id}_${todayStr(appTz)}`;
      if (localStorage.getItem(key)) return;
      if (jitHasSignal) {
        setJitSource('auto');
        setShowJit(true);
      } else {
        // Takeover evitado. Sem este evento, a análise do H1 não distingue
        // "dia quieto" de "gestor abandonou" — e não mede a taxa de takeover.
        // 1× por dia por gestor, com o mesmo padrão de marcador do "seen".
        const skipKey = `zc_jit_skip_${currentUser.id}_${todayStr(appTz)}`;
        if (!localStorage.getItem(skipKey)) {
          localStorage.setItem(skipKey, '1');
          track('jit_skipped', { source: 'auto', metadata: { reason: 'no_signal' } });
        }
      }
    } catch (_) {}
  }, [currentUser?.id, jit, plansLoaded, jitHasSignal, tab]);

  const closeJit = () => {
    try { if (currentUser) localStorage.setItem(`zc_jit_seen_${currentUser.id}_${todayStr(appTz)}`, '1'); } catch (_) {}
    setBriefingSeenToday(true);
    setShowJit(false);
  };
  const openJit = () => { setJitSource('manual'); setShowJit(true); };

  /**
   * Reconhecimento recebido → aviso na entrada do app.
   *
   * O dado e a noção de "não visto" já existiam, mas só DENTRO do Meu ID: quem
   * não abrisse a aba nunca sabia que tinha sido reconhecido — e um elogio que
   * ninguém vê não fecha o laço que ele existe para fechar.
   *
   * Reaproveita a mesma chave que o OperationalIdView já grava
   * (`zc_seen_recognitions_<id>`), então abrir o Meu ID continua sendo o que
   * marca como lido. Uma fonte de verdade, não duas.
   */
  useEffect(() => {
    if (!currentUser?.id) return;
    if (!ROLE_TABS[currentUser.role]?.includes('id')) return;
    let cancel = false;
    (async () => {
      try {
        const { fetchRecognitions } = await import('../../lib/sync');
        const list = await fetchRecognitions(currentUser.id);
        if (cancel || !list.length) return;
        const key = `zc_seen_recognitions_${currentUser.id}`;
        let seen = new Set();
        try { seen = new Set(JSON.parse(localStorage.getItem(key) || '[]')); } catch (_) {}
        const fresh = list.filter(r => !seen.has(r.id));
        if (!fresh.length) return;
        setNewRecognitions(fresh);
        setShowRecognitionPopup(true);
        track('recognition_notified', {
          source: 'app_open',
          metadata: { count: fresh.length },
        });
      } catch (e) { console.warn('[recognitions] check failed', e); }
    })();
    return () => { cancel = true; };
  }, [currentUser?.id, currentUser?.role]);

  // Check for pending requests when gestao logs in
  useEffect(() => {
    if (currentUser?.role !== 'gestao') return;
    const check = async () => {
      try {
        const supabase = (await import('../../lib/supabase')).authedSupabase();
        const { count } = await supabase
          .from('user_requests')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pendente');
        if (count > 0) {
          setPendingRequestsCount(count);
          setShowRequestsPopup(true);
          setPopupMinimized(false);
        }
      } catch(e) { console.warn('Pending check failed:', e); }
    };
    // Small delay to let the app settle after login
    const t = setTimeout(check, 1500);
    return () => clearTimeout(t);
  }, [currentUser?.id]);

  /**
   * Reinscrição automática do push, a cada abertura de quem já deu permissão.
   *
   * Antes isto rodava só quando a pessoa tinha ZERO inscrições
   * (`count === 0` por `user_id`), e o atalho abria três buracos — todos
   * silenciosos, com o cabeçalho exibindo "Notif. ON" e nada chegando:
   *
   *   1. Segundo aparelho. Quem já tinha o celular registrado nunca registrava o
   *      tablet ou o desktop: a contagem por usuário já era > 0 e o novo
   *      dispositivo ficava de fora para sempre.
   *   2. Inscrição podada. A notify-overdue apaga endpoint que o serviço de push
   *      rejeita com 404/410 (v8). Depois disso a linha não voltava sozinha —
   *      dependia da pessoa desativar e reativar a notificação na mão.
   *   3. Troca de navegador/reinstalação do PWA gera endpoint novo, e o antigo
   *      contava como inscrição válida.
   *
   * `requestPushPermission` é idempotente: `Notification.requestPermission()` não
   * pergunta nada se já está concedida, `pushManager.subscribe` devolve a
   * inscrição existente do aparelho, e a gravação é upsert por `endpoint`. Rodar
   * sempre custa uma escrita por abertura e faz o estado se curar sozinho.
   */
  useEffect(() => {
    hasPushPermission().then(async (granted) => {
      setPushEnabled(granted);
      if (!granted || !currentUser) return;
      try {
        const sub = await requestPushPermission(currentUser);
        if (!sub) console.warn('[Push] permissão concedida mas a inscrição falhou');
      } catch (e) { console.warn('[Push] reinscrição falhou:', e); }
    });
  }, [currentUser?.id]);

  /**
   * Antes: `requestPushPermission()` e pronto. Quando o navegador não suportava,
   * a função devolvia `null` em silêncio (lib/sync.js) e o botão parecia
   * quebrado — nada acontecia, nenhuma explicação.
   *
   * No iPhone isso é o caso COMUM, não a exceção: o Safari só expõe Web Push
   * quando o site está instalado na Tela de Início (iOS 16.4+). Em aba normal
   * `PushManager` nem existe. O usuário tocava, não acontecia nada, e não havia
   * como descobrir o porquê.
   *
   * A limitação do iOS continua — o que muda é que cada caminho de falha agora
   * diz o que fazer.
   */
  const enablePush = async () => {
    if (!currentUser) return;
    const diag = pushDiagnosis();
    if (diag.blocked) { showToast(diag.message); return; }

    const sub = await requestPushPermission(currentUser);
    setPushEnabled(!!sub);
    if (!sub) showToast(diag.failMessage);
  };

  const disablePush = async () => {
    if (!currentUser) return;
    try {
      const supabase = (await import('../../lib/supabase')).authedSupabase();
      // Unsubscribe no browser
      if ('serviceWorker' in navigator) {
        try {
          const reg = await navigator.serviceWorker.ready;
          const sub = await reg.pushManager.getSubscription();
          if (sub) await sub.unsubscribe();
        } catch(e) { console.warn('[Push] Browser unsubscribe failed:', e); }
      }
      // Tenta RPC primeiro
      const { error: rpcError } = await supabase.rpc('delete_push_subscription', { p_user_id: currentUser.id });
      if (rpcError) {
        console.warn('[Push] RPC failed, trying direct delete:', rpcError);
        // Fallback: delete direto
        const { error: delError } = await supabase
          .from('push_subscriptions')
          .delete()
          .eq('user_id', currentUser.id);
        if (delError) console.warn('[Push] Direct delete also failed:', delError);
        else console.log('[Push] Direct delete OK');
      } else {
        console.log('[Push] RPC delete OK');
      }
    } catch(e) { console.warn('[Push] disablePush error:', e); }
    setPushEnabled(false);
  };

  // Antes do login não há token, e o RLS só libera metadados de tenant (empresa,
  // lojas, setores, tipos) mais a lista de nomes da tela de login, via RPC.
  // Dados operacionais — templates, execuções, usuários, folgas — só depois do
  // login, no efeito seguinte.
  useEffect(() => {
    const tenantSlug = getTenantSlug();
    console.log('[App] tenant slug:', tenantSlug, '| hostname:', typeof window !== 'undefined' ? window.location.hostname : 'SSR');
    if (!tenantSlug) return;

    // Resolve a empresa pela slug do subdomínio PRIMEIRO. O company_id real pode
    // diferir da slug: no self-service a empresa nasce com id = slug + sufixo
    // (ex.: subdomínio `teste-1` → id `teste-1-ssfp3kv8`). units/setores/tipos e a
    // lista de login são escopados pelo id real — usar a slug direto os deixa
    // vazios (ninguém no seletor de nomes). Fallback pro slug preserva o IBR,
    // cujo id já é igual à slug detectada ('ibr').
    (async () => {
      try {
        const co = await fetchCompany(tenantSlug);
        const cid = co?.id || tenantSlug;
        // Namespaceia o cache local antes de qualquer leitura: sem isto, o
        // fallback offline pode servir dados de outra empresa aberta antes
        // neste mesmo navegador (inclusive os nomes da tela de login).
        setCacheScope(cid);
        const [units, sectors, types, publicUsers] = await Promise.all([
          fetchUnits(cid),
          fetchSectors(cid),
          fetchChecklistTypes(cid),
          fetchPublicUsers(cid),
        ]);
        if (co) setCompany(co);
        if (units?.length) {
          setDynamicUnits(units.map(u => ({
            id: u.id, name: u.name, color: u.color, timezone: u.timezone,
            sectors: (sectors || []).filter(s => s.unit_id === u.id).map(s => s.name),
          })));
        }
        if (sectors?.length) setDynamicSectors(sectors);
        if (types?.length) setDynamicTypes(types);
        // Alimenta o seletor de nomes da LoginScreen. Nunca deixar em null: o
        // render trava na tela de carregamento se a lista não chegar.
        setUsers(publicUsers || []);
      } catch (e) {
        console.error('[App] Startup error:', e);
        setUsers([]);
      }
    })();
  }, []);

  // Dados operacionais: só com sessão aberta, e escopados por company_id no RLS.
  useEffect(() => {
    if (!currentUser) return;
    const TEMPLATES_VERSION = 'v5-stable-ids';
    let cancelled = false;

    // SEED_TEMPLATES e SEED_USERS são dados do IBR, herança de quando o app era
    // single-tenant. NUNCA podem ser gravados nem exibidos em outro tenant: sem
    // este gate, toda empresa nova recebia os checklists do IBR gravados no seu
    // próprio company_id no 1º login (o storedVersion nasce nulo num navegador
    // novo, então o seed sempre disparava) e ainda os via na tela.
    const isIbr = (currentUser.companyId || currentUser.company_id) === 'ibr';

    const loadTemplates = async () => {
      // Empresa que não é o IBR começa com os próprios checklists (nenhum, até o
      // onboarding criar) — sem fallback nem seed do IBR.
      if (!isIbr) return await fetchTemplates([]);

      // Check version to reset stale local cache
      let storedVersion = null;
      try { const r = await storageGet('ibr_templates_version'); storedVersion = r.value; } catch {}
      const tpl = await fetchTemplates(SEED_TEMPLATES);
      if (storedVersion !== TEMPLATES_VERSION) {
        // Seed fresh templates to Supabase and reset completions
        await dbSaveTemplates(SEED_TEMPLATES);
        try { await storageSet('ibr_templates_version', TEMPLATES_VERSION); } catch {}
        try { await storageSet('ibr_completions', JSON.stringify([])); } catch {}
        return SEED_TEMPLATES;
      }
      return tpl;
    };

    Promise.all([
      loadTemplates(),
      fetchCompletions(),
      fetchUsers(isIbr ? SEED_USERS : []),
      fetchClosures(),
      fetchTaskReviews(),
      // A nota do checklist inteiro vem por RPC desde
      // 20260808_conferencia_privacidade: `completions.review_note` não é mais
      // escrito, porque aquela coluna é legível pela empresa inteira.
      fetchCompletionNotes(),
      // Contestações: a liderança recebe a fila da empresa, o colaborador só as
      // dele. Quem decide é a RPC, pelo papel no token.
      fetchDisputes(),
    ]).then(async ([tpl, comp, usr, cls, reviews, notes, disp]) => {
      setDisputes(disp);
      if (cancelled) return;
      setTemplates(tpl);
      // Os vereditos entram grudados nos itens (ver `annotateReviews`): daqui
      // para a frente, tudo que lê `completions` já enxerga o que a liderança
      // julgou, sem precisar receber uma segunda estrutura.
      setCompletions(annotateReviews(comp, reviews, notes));
      setUsers(usr);
      setClosures(cls);
      await seedSupabaseIfEmpty(tpl, usr);
    }).catch(e => console.error('[App] Data load error:', e));

    // Real-time: listen for new completions from other devices
    const unsubscribe = subscribeToCompletions(null, record => {
      setCompletions(prev => {
        if (!prev) return [record];
        if (prev.some(c => c.id === record.id)) return prev;
        return [...prev, record].slice(-500);
      });
    });

    // Real-time: listen for template changes from Gerenciar (other devices)
    const unsubscribeTemplates = subscribeToTemplates(updated => {
      setTemplates(updated);
    });

    return () => { cancelled = true; unsubscribe(); unsubscribeTemplates(); };
  }, [currentUser]);

  // ── Data persistence — all writes go to Supabase via sync layer ──────────────

  const saveTemplates = async (next, changedIds = null) => {
    setTemplates([...next]);
    try {
      await dbSaveTemplates(next, changedIds);
    } catch (e) {
      console.error('saveTemplates', e);
      // O estado local já mostra o checklist; se o banco recusou, dizer isso é
      // o mínimo — senão o gestor só descobre quando some no próximo reload.
      showToast(`Não foi possível salvar no servidor: ${e?.message || 'tente de novo.'}`);
      throw e;
    }
  };

  const saveCompletion = async record => {
    // Optimistic local update first
    setCompletions(prev => [...(prev || []), record].slice(-500));
    // Then push to Supabase (queued offline if needed)
    try { await syncSaveCompletion(record); } catch (e) { console.error('saveCompletion', e); }

    // Instrumentação: 1 evento de checklist + 1 por tarefa concluída.
    try {
      const items = Array.isArray(record.items) ? record.items : [];
      const done = items.filter(i => i.done).length;
      const total = items.length;
      track('checklist_completed', {
        source: 'checklist',
        checklistId: record.templateId,
        userId: record.operatorUserId,
        unitId: record.unitId,
        metadata: {
          template_name: record.templateName,
          sector: record.sector,
          shift: record.shift,
          date: record.date,
          done, total,
          rate: total ? Math.round((done / total) * 100) : 0,
          critical_missed: items.filter(i => i.critical && !i.done).length,
        },
      });
      for (const it of items) {
        if (!it.done) continue;
        track('task_completed', {
          source: 'checklist',
          checklistId: record.templateId,
          taskId: it.id,
          // Quem EXECUTOU a tarefa, não quem apertou "Concluir". Numa execução
          // colaborativa o submitter levava o crédito de tudo nos eventos — o
          // JSONB da conclusão já guardava o doneBy certo, e as duas fontes
          // discordavam. Registro antigo, sem doneBy, segue no submitter.
          userId: it.doneBy || record.operatorUserId,
          unitId: record.unitId,
          metadata: {
            critical: !!it.critical,
            has_photo: !!it.hasPhoto,
            submitted_by: record.operatorUserId || null,
          },
        });
      }
    } catch (e) { console.warn('[track] completion instrumentation failed (ignored)', e); }
  };

  const saveCompletionsBulk = async nextCompletions => {
    const capped = nextCompletions.slice(-500);
    setCompletions(capped);
    // Push each to Supabase
    for (const r of capped) {
      try { await syncSaveCompletion(r); } catch {}
    }
  };

  const saveUsers = async (next, opts) => {
    const anterior = users;
    setUsers(next);
    try {
      await dbSaveUsers(next, opts);
    } catch (e) {
      console.error('saveUsers', e);
      // Desfaz o otimismo: era exatamente ele que enganava — o colaborador
      // aparecia na lista, o banco tinha recusado, e só o reload contava a
      // verdade. Volta a lista e diz o motivo.
      setUsers(anterior);
      showToast(`Não foi possível salvar no servidor: ${e?.message || 'tente de novo.'}`);
      throw e;
    }
  };

  const saveClosures = async next => {
    setClosures(next);
    try { await dbSaveClosures(next); } catch (e) { console.error('saveClosures', e); }
  };

  /**
   * Conferência de uma execução pela liderança. Devolve true/false — a UI que
   * mostra o erro é o modal, que é onde a pessoa está olhando.
   *
   * O estado local é atualizado com o resultado ANTES de qualquer refetch:
   * a conferência muda o índice da liderança na hora, e esperar o próximo
   * carregamento faria o número parecer travado.
   */
  const reviewCompletionAndSync = async (completionId, { items = [], note = null, reviewed = true } = {}) => {
    try {
      await reviewCompletion(completionId, { items, note, reviewed });
      const porItem = new Map(items.map(i => [i.item_id, i]));
      setCompletions(prev => (prev || []).map(c => (c.id === completionId ? {
        ...c,
        reviewedBy: reviewed ? currentUser.id : null,
        reviewedByName: reviewed ? currentUser.name : null,
        reviewedAt: reviewed ? new Date().toISOString() : null,
        reviewNote: reviewed ? (note || null) : null,
        // Espelha os vereditos que acabaram de ser gravados. Sem isto o índice
        // do colaborador e o briefing só mudariam no próximo carregamento —
        // e a liderança reabriria a conferência achando que não salvou.
        items: (c.items || []).map(it => {
          const v = reviewed ? porItem.get(it.id) : null;
          if (!v) { const { review: _r, ...limpo } = it; return limpo; }
          // `executedBy` espelha a MESMA regra da RPC (doneBy, com fallback no
          // submissor). Sem ele aqui, o briefing e o índice só passariam a
          // enxergar o destinatário certo no carregamento seguinte.
          return { ...it, review: {
            verdict: v.verdict, note: v.note || null, byName: currentUser.name,
            executedBy: it.doneBy || c.operatorUserId || null,
          } };
        }),
      } : c)));
      /**
       * As DUAS métricas de sucesso da conferência — e nenhuma delas é "a fila
       * esvaziou". Fila zerada com 100% de aprovação é fracasso disfarçado.
       *
       *   `sem_motivo / apontamentos` — apontamento que chega ao colaborador
       *   como veredito nu. Linha de base de 08/08/2026: 39 de 41, ou 95%.
       *   Meta: abaixo de 20%.
       *
       *   `apontamentos / tarefas_julgadas` — a taxa de discordância. Linha de
       *   base: 3,1% (41 de 1331). Este número é um PISO, não um teto: se cair
       *   perto de zero depois de qualquer mudança, a mudança piorou o produto,
       *   por mais confortável que a tela tenha ficado.
       *
       * `modo` nasce fixo em 'individual' de propósito: se um dia existir
       * aprovação em lote, a comparação entre os dois já vai existir desde o
       * primeiro dia, sem precisar de uma nova coluna nem de backfill.
       */
      const reprovadas = items.filter(i => i.verdict === 'reprovado').length;
      const ressalvas = items.filter(i => i.verdict === 'ressalva').length;
      const apontamentos = items.filter(i => i.verdict === 'reprovado' || i.verdict === 'ressalva');
      track('completion_reviewed', { source: 'relatorios', metadata: {
        completion_id: completionId, undone: !reviewed, has_note: !!note,
        tarefas_julgadas: items.length,
        reprovadas, ressalvas,
        apontamentos: apontamentos.length,
        sem_motivo: apontamentos.filter(i => !(i.note || '').trim()).length,
        modo: 'individual',
      } });
      return true;
    } catch (e) {
      console.error('reviewCompletion', e);
      return false;
    }
  };

  // ── Contestação ────────────────────────────────────────────────────────────
  //
  // O contrapeso do resto desta tela: até aqui o produto só tinha caminho para a
  // liderança julgar. Quem recebe o julgamento passa a ter voz.
  //
  // O estado local é atualizado com o resultado ANTES de qualquer refetch, pelo
  // mesmo motivo da conferência: quem acabou de contestar precisa ver que
  // contestou. Esperar o próximo carregamento faria a pessoa clicar de novo.
  const [disputes, setDisputes] = useState([]);

  const contestar = async (completionId, itemId, reason) => {
    try {
      await raiseDispute(completionId, itemId, reason);
      const nova = {
        completionId, itemId, reason, status: 'aberta',
        raisedBy: currentUser.id, raisedByName: currentUser.name,
        raisedAt: new Date().toISOString(),
        resolvedByName: null, resolvedAt: null, resolutionNote: null,
      };
      setDisputes(prev => [nova, ...(prev || []).filter(d => !(d.completionId === completionId && d.itemId === itemId))]);
      track('dispute_raised', { source: 'briefing', metadata: { completion_id: completionId, item_id: itemId } });
      return true;
    } catch (e) {
      console.error('raiseDispute', e);
      return false;
    }
  };

  const responderContestacao = async (completionId, itemId, status, note, newVerdict) => {
    try {
      await resolveDispute(completionId, itemId, status, note, newVerdict);
      setDisputes(prev => (prev || []).map(d => (d.completionId === completionId && d.itemId === itemId
        ? { ...d, status, resolvedBy: currentUser.id, resolvedByName: currentUser.name, resolvedAt: new Date().toISOString(), resolutionNote: note || null }
        : d)));
      // Dar razão muda o veredito no banco; espelhar aqui evita que o índice do
      // colaborador e o briefing sigam mostrando a nota antiga até o refetch.
      if (newVerdict) {
        setCompletions(prev => (prev || []).map(c => (c.id === completionId ? {
          ...c,
          items: (c.items || []).map(it => (it.id === itemId && it.review
            ? { ...it, review: { ...it.review, verdict: newVerdict } }
            : it)),
        } : c)));
      }
      track('dispute_resolved', { source: 'relatorios', metadata: {
        completion_id: completionId, item_id: itemId, status, corrigiu: !!newVerdict,
      } });
      return true;
    } catch (e) {
      console.error('resolveDispute', e);
      return false;
    }
  };

  // ── Briefing diário ────────────────────────────────────────────────────────
  const [showBriefing, setShowBriefing] = useState(false);

  const briefing = useMemo(() => {
    if (!currentUser || !completions?.length) return null;
    return buildDailyBriefing({
      completions, userId: currentUser.id, userName: currentUser.name, today: todayStr(appTz),
    });
  }, [completions, currentUser, appTz]);

  /**
   * Abre sozinho UMA vez por briefing. A chave guarda o DIA do briefing, não a
   * data de hoje: se a liderança conferir a terça só na quinta, a pessoa vê o
   * resumo da terça na quinta — e não vê de novo na sexta.
   *
   * Espera o onboarding e as boas-vindas saírem da frente; três telas cheias
   * empilhadas no primeiro acesso é o mesmo que nenhuma.
   */
  useEffect(() => {
    if (!briefing || !currentUser || showWelcome || showCompanyOnboarding) return;
    try {
      const key = `zc_briefing_visto_${currentUser.id}`;
      if (localStorage.getItem(key) === briefing.date) return;
      setShowBriefing(true);
      localStorage.setItem(key, briefing.date);
      track('briefing_shown', { source: 'app', metadata: { date: briefing.date, tom: briefing.tom, reprovadas: briefing.reprovadas } });
    } catch (_) {}
  }, [briefing, currentUser, showWelcome, showCompanyOnboarding]);

  // ── Foto de perfil ─────────────────────────────────────────────────────────
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);

  /**
   * `currentUser` vem do validate_pin, que não devolve a foto — sem isto, quem
   * enviou a foto num aparelho continuaria sem ela em qualquer outro, porque o
   * cabeçalho e o Meu ID leem da sessão, não da lista.
   */
  useEffect(() => {
    if (!currentUser || !users?.length) return;
    const row = users.find(u => u.id === currentUser.id);
    if (!row) return;
    const url = row.avatarUrl ?? null;
    if ((currentUser.avatarUrl ?? null) === url) return;
    setCurrentUser(prev => (prev ? { ...prev, avatarUrl: url } : prev));
  }, [users, currentUser]);

  /**
   * Recebe o dataURL já comprimido pelo modal (ou null, para remover) e devolve
   * true/false — é o modal que mostra o erro, porque é lá que a pessoa está
   * olhando. Sem rede, FALHA e diz: ao contrário de um checklist, a foto não
   * tem fila offline, e fingir que salvou seria mentir para o usuário.
   */
  const saveAvatar = async dataUrl => {
    const companyId = currentUser?.companyId || currentUser?.company_id;
    try {
      let url = null;
      if (dataUrl) {
        const blob = await (await fetch(dataUrl)).blob();
        url = await uploadUserAvatar(companyId, currentUser.id, blob);
      }
      await saveUserAvatar(currentUser.id, url);
      // Os três lugares que guardam a pessoa: a sessão (cabeçalho e Meu ID), a
      // lista de usuários (rankings) e o localStorage (para o próximo reload
      // não voltar com a foto antiga).
      const nextUser = { ...currentUser, avatarUrl: url };
      setCurrentUser(nextUser);
      setUsers(prev => (prev || []).map(u => (u.id === currentUser.id ? { ...u, avatarUrl: url } : u)));
      try { persistSession(getSessionToken(), nextUser); } catch (_) {}
      track('avatar_updated', { source: 'perfil', metadata: { removed: !url } });
      return true;
    } catch (e) {
      console.error('saveAvatar', e);
      return false;
    }
  };

  const [testDataResult, setTestDataResult] = useState(null); // { ok: boolean, message: string } | null

  const generateTestData = async (days = 7) => {
    setGeneratingTestData(true);
    setTestDataResult(null);
    try {
      const existingNames = new Set(users.map(u => u.name));
      const newUsers = SEED_USERS.filter(u => ['u5', 'u9', 'u13'].includes(u.id) && !existingNames.has(u.name));
      const nextUsers = newUsers.length ? [...users, ...newUsers] : users;
      // Grava só os usuários de teste — a equipe existente não é reescrita.
      if (newUsers.length) await dbSaveUsers(nextUsers, { changedIds: newUsers.map(u => u.id) });

      const simulated = generateSimulatedCompletions(templates, nextUsers, days);
      const nextCompletions = [...completions, ...simulated];
      const payload = JSON.stringify(nextCompletions);
      console.log('Gravando', simulated.length, 'checklists simulados,', payload.length, 'bytes no total.');
      await saveCompletionsBulk(nextCompletions);

      setTestDataResult({
        ok: true,
        message: `${simulated.length} checklists simulados gerados${newUsers.length ? ` e ${newUsers.length} usuários de teste criados` : ''}.`,
      });
    } catch (e) {
      console.error(e);
      const detail = e && e.message ? e.message : String(e);
      setTestDataResult({ ok: false, message: `Não foi possível gerar os dados de teste. Detalhe: ${detail}` });
    } finally {
      setGeneratingTestData(false);
    }
  };


  // A tela de login só precisa da lista de nomes. Templates e execuções agora
  // chegam depois do login — esperar por eles aqui travaria a entrada.
  if (users === null) return <LoadingScreen />;

  const offlineBanner = !isOnline ? (
    <div className="flex items-center justify-center gap-2 px-4 py-2" style={{ background: C.critical, color: 'white', position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999 }}>
      <WifiOff size={14} />
      <span style={{ fontSize: 12, fontWeight: W.semibold }}>Sem conexão — dados salvos localmente</span>
    </div>
  ) : null;

  if (!currentUser) {
    return (
      <>
        {offlineBanner}
        <div style={{ paddingTop: !isOnline ? 40 : 0 }}>
          <LoginScreen
        company={company}
        users={users}
        onLogin={handleLogin}
          />
        </div>
      </>
    );
  }

  // Sessão aberta: agora sim esperamos os dados operacionais, que o efeito
  // pós-login busca com o token e o RLS entrega escopados por company_id.
  if (templates === null || completions === null) return <LoadingScreen />;

  // ── Portão de billing ──
  // Teste vencido / assinatura encerrada: bloqueia o app (os dados seguem
  // intactos). O RLS já nega escrita no banco; isto é o bloqueio visível.
  const billing = billingState(company);
  if (billing.state === 'expired') {
    return <SubscribePanel mode="block" company={company} currentUser={currentUser} onLogout={doLogout} />;
  }

  const dismissNudge = () => setShowNudge(false);

  const allowedTabs = ROLE_TABS[currentUser.role];
  const canSwitchUnit = currentUser.unitId == null;
  const activeTab = allowedTabs.includes(tab) ? tab : allowedTabs[0];
  // Contexto do rail lateral quando o papel tem poucos destinos (colaborador).
  const sideNavDate = new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
  // A unidade ativa sai das unidades DA EMPRESA (ACTIVE_UNITS), não da constante
  // UNITS do IBR. `unitId` nulo (login recém-feito) cai na primeira da empresa.
  const unit = ACTIVE_UNITS.find(u => u.id === unitId) || ACTIVE_UNITS[0];

  // ── Onboarding guiado ──
  // Empresa que ainda não concluiu a configuração (onboarded_at nulo). A gestão
  // cai no wizard passo a passo; os demais papéis pedem para o gestor concluir.
  const needsOnboarding = company && !company.onboarded_at;
  if (needsOnboarding && currentUser.role === 'gestao') {
    return (
      <OnboardingWizard
        company={company} currentUser={currentUser} onLogout={doLogout}
        onDone={({ patch, units: us, sectors: ss, types: ts }) => {
          setCompany(c => ({ ...(c || {}), ...patch }));
          setDynamicUnits(us.map(u => ({
            id: u.id, name: u.name, color: u.color, timezone: u.timezone,
            sectors: ss.filter(s => s.unitId === u.id).map(s => s.name),
          })));
          setDynamicSectors(ss.map(s => ({ id: s.id, unit_id: s.unitId, name: s.name })));
          setDynamicTypes(ts.map(t => ({ id: t.id, name: t.name })));
          setUnitId(us[0]?.id || null);
        }}
      />
    );
  }
  if (needsOnboarding || !unit) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 16, padding: 28, maxWidth: 380, textAlign: 'center' }}>
          <h2 style={{ fontSize: 18, fontWeight: W.semibold, color: C.ink, marginBottom: 8 }}>Configuração pendente</h2>
          <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 20 }}>
            A empresa ainda está sendo configurada. Peça ao gestor para concluir o primeiro acesso.
          </p>
          <button onClick={doLogout}
            style={{ padding: '10px 20px', borderRadius: 10, border: `1.5px solid ${C.border}`, background: 'white', color: C.muted, fontWeight: W.semibold, fontSize: 13, cursor: 'pointer' }}>
            Sair
          </button>
        </div>
      </div>
    );
  }

  return (
    <UnitsContext.Provider value={ACTIVE_UNITS}>
    <SectorsContext.Provider value={dynamicSectors}>
    <div className="zc-root" style={{ minHeight: '100vh', color: C.ink }}>
      {/* `.font-display` NÃO estava morta — estava nociva: este bloco forçava
          `system-ui` (anulando a Inter) e reimpunha `font-weight: 800` em 59
          elementos. Agora ela mora em globals.css e é só papel óptico
          (tabular-nums + tracking). `background`/`display`/`fontFamily` saíram
          do style inline para a classe `.zc-root` — estilo inline vence classe,
          e sem isso o desktop não consegue trocar a coluna por linha. */}
      <style>{`
        .font-mono-ibr { font-family: ui-monospace, 'SF Mono', 'Roboto Mono', monospace; }
        * { box-sizing: border-box; }
        input, textarea, button { font-family: inherit; }
      `}</style>

      {showNudge && (
        <TrialNudge daysLeft={billing.daysLeft} onDismiss={dismissNudge}
          onOpen={() => { dismissNudge(); setShowPlans(true); }} />
      )}
      {showPlans && (
        <SubscribePanel mode="modal" company={company} currentUser={currentUser} onClose={() => setShowPlans(false)} />
      )}

      <a className="zc-skip" href="#zc-main-content">Pular para o conteúdo</a>

      {/* Rail lateral: só aparece >= 1024px (CSS). No celular fica display:none
          e a BottomNav segue sendo a navegação, sem nenhuma mudança. */}
      <SideNav
        tab={activeTab} setTab={setTab} allowedTabs={allowedTabs}
        pendingCount={pendingRequestsCount}
        jitSignal={MANAGER_ROLES.includes(currentUser.role) && jitHasSignal && !jitSeenToday}
        idSignal={newRecognitions.length > 0}
        unitName={unit?.name} dateLabel={sideNavDate}
      />

      {/* `display: contents` no celular — este div não existe para o layout. */}
      <div className="zc-main">
      <Header
        unit={unit} onSelectUnit={setUnitId} allSelected={unitId == null} allUnits={ACTIVE_UNITS}
        currentUser={currentUser} canSwitchUnit={canSwitchUnit}
        onLogout={doLogout}
        isOnline={isOnline} syncing={syncing} pendingSync={pendingSync}
        pushEnabled={pushEnabled} onEnablePush={enablePush} onDisablePush={disablePush}
        trialDaysLeft={billing.state === 'trialing' && currentUser.role === 'gestao' ? billing.daysLeft : null}
        onOpenPlans={() => setShowPlans(true)}
        company={company}
        onStartTour={() => { setShowJit(false); setShowTour(true); }}
        onOpenAvatar={() => setShowAvatarPicker(true)}
      />

      {showAvatarPicker && (
        <AvatarPickerModal
          user={currentUser} accent={unit.color}
          onClose={() => setShowAvatarPicker(false)}
          onSave={saveAvatar}
        />
      )}

      {/* Onboarding guiado — primeiro acesso da gestão de empresa nova */}
      {showCompanyOnboarding && (
        <CompanyOnboarding
          company={company} units={ACTIVE_UNITS} currentUser={currentUser}
          onCreateTemplates={async created => { await saveTemplates([...(templates || []), ...created], created.map(t => t.id)); }}
          onClose={() => {
            setShowCompanyOnboarding(false);
            try { localStorage.setItem(`zc_company_onboarding_${currentUser.id}`, '1'); } catch (_) {}
          }}
          onGoToTab={t => { if (allowedTabs.includes(t)) setTab(t); }}
          onStartTour={() => setShowTour(true)}
        />
      )}

      {/* Tour guiado pelas abas reais — primeiros passos do gestor */}
      {showTour && !showCompanyOnboarding && (
        <GestorTour
          allowedTabs={allowedTabs} accent={unit.color}
          onGoToTab={t => { if (allowedTabs.includes(t)) setTab(t); }}
          onClose={() => setShowTour(false)}
        />
      )}

      {/* Tela de boas-vindas — primeiro acesso */}
      {showWelcome && !showCompanyOnboarding && (
        <WelcomeScreen role={currentUser.role} onClose={() => setShowWelcome(false)} />
      )}

      {/* Briefing do dia — o retorno da conferência da liderança */}
      {showBriefing && briefing && (
        <BriefingScreen briefing={briefing} userName={currentUser.name} accent={unit.color}
          disputes={disputes} onDispute={contestar}
          onClose={() => setShowBriefing(false)} />
      )}

      {/* Daily J.I.T. (H1) — primeira tela do dia para gestão */}
      {showJit && !showWelcome && !showCompanyOnboarding && !showTour && jit && (
        <JitPanel
          jit={jit}
          currentUser={currentUser}
          accent={unit.color}
          openSource={jitSource}
          actionPlans={actionPlans}
          onCreatePlan={handleCreatePlan}
          onCompletePlan={handleCompletePlan}
          onClose={closeJit}
          onNavigate={(targetUnitId, targetTab) => {
            if (targetUnitId && canSwitchUnit) setUnitId(targetUnitId);
            if (targetTab && allowedTabs.includes(targetTab)) setTab(targetTab);
            closeJit();
          }}
        />
      )}
      {showRequestsPopup && currentUser?.role === 'gestao' && !popupMinimized && (
        <div className="zc-on-dark zc-requests-popup" style={{
          position: 'fixed', bottom: 'calc(var(--zc-nav-h) + 8px + env(safe-area-inset-bottom, 0px))',
          left: 12, right: 12, zIndex: 100,
          background: '#063C5C', borderRadius: 14, padding: '14px 16px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.25)',
          display: 'flex', alignItems: 'flex-start', gap: 12,
        }}>
          <Bell size={20} color="#fff" aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: W.semibold, color: 'white', marginBottom: 3 }}>
              {pendingRequestsCount === 1
                ? '1 solicitação pendente'
                : `${pendingRequestsCount} solicitações pendentes`}
            </p>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 10, lineHeight: 1.4 }}>
              {pendingRequestsCount === 1
                ? 'Há uma nova solicitação aguardando sua aprovação.'
                : `Há ${pendingRequestsCount} solicitações aguardando aprovação.`}
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => { setTab('usuarios'); setShowRequestsPopup(false); }}
                style={{ flex: 1, padding: '8px 0', borderRadius: 8, background: 'white', color: '#063C5C', border: 'none', fontWeight: W.semibold, fontSize: 13, cursor: 'pointer' }}
              >
                Ver agora
              </button>
              <button
                onClick={() => setPopupMinimized(true)}
                style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none', fontWeight: W.semibold, fontSize: 12, cursor: 'pointer' }}
              >
                Minimizar
              </button>
              <button
                onClick={() => setShowRequestsPopup(false)}
                style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none', fontWeight: W.semibold, fontSize: 16, cursor: 'pointer', lineHeight: 1 }}
              >
                ×
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Aviso de reconhecimento — espelha o popup de solicitação do gestor.
          Fica na mesma âncora e usa `zc-requests-popup`, então também some no
          desktop, onde o badge do rail já cumpre o papel. */}
      {showRecognitionPopup && newRecognitions.length > 0 && (
        <div className="zc-on-dark zc-requests-popup" style={{
          position: 'fixed', bottom: 'calc(var(--zc-nav-h) + 8px + env(safe-area-inset-bottom, 0px))',
          left: 12, right: 12, zIndex: 100,
          background: C.ink, borderRadius: 14, padding: '14px 16px',
          boxShadow: '0 4px 24px rgba(8,20,30,0.28)',
          display: 'flex', alignItems: 'flex-start', gap: 12,
        }}>
          <span aria-hidden="true" style={{
            width: 34, height: 34, borderRadius: R.pill, flexShrink: 0, marginTop: 1,
            background: 'rgba(74,222,128,0.18)', display: 'grid', placeItems: 'center',
          }}>
            <Award size={18} color={greenOnDark} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: T.bodySm, fontWeight: W.semibold, color: 'white', marginBottom: 3 }}>
              {newRecognitions.length === 1
                ? 'Você recebeu um reconhecimento'
                : `Você recebeu ${newRecognitions.length} reconhecimentos`}
            </p>
            <p style={{ fontSize: T.caption, color: C.inkMuted, marginBottom: 10, lineHeight: 1.4 }}>
              {newRecognitions.length === 1 && newRecognitions[0].fromUserName
                ? `${truncName(newRecognitions[0].fromUserName, 24)} reconheceu seu trabalho.`
                : 'Sua liderança reconheceu seu trabalho.'}
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => { setTab('id'); setShowRecognitionPopup(false); }}
                style={{ flex: 1, padding: '8px 0', borderRadius: R.sm, background: 'white', color: C.ink, border: 'none', fontWeight: W.semibold, fontSize: T.caption, cursor: 'pointer' }}
              >
                Ver no meu ID
              </button>
              <button
                onClick={() => setShowRecognitionPopup(false)}
                aria-label="Fechar aviso de reconhecimento"
                style={{ padding: '8px 12px', borderRadius: R.sm, background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none', fontWeight: W.semibold, fontSize: T.bodyLg, cursor: 'pointer', lineHeight: 1 }}
              >
                ×
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Badge minimizado */}
      {showRequestsPopup && currentUser?.role === 'gestao' && popupMinimized && (
        <button
          onClick={() => setPopupMinimized(false)}
          className="zc-on-dark zc-requests-popup"
          style={{
            position: 'fixed', bottom: 'calc(var(--zc-nav-h) + 16px + env(safe-area-inset-bottom, 0px))',
            right: 16, zIndex: 100,
            background: '#063C5C', color: 'white',
            border: 'none', borderRadius: 999, padding: '8px 14px',
            fontSize: 12, fontWeight: W.semibold, cursor: 'pointer',
            boxShadow: '0 2px 12px rgba(0,0,0,0.2)',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <Bell size={15} aria-hidden /> <span style={{ background: C.warning, borderRadius: 999, padding: '1px 6px', fontSize: 11 }}>{pendingRequestsCount}</span>
        </button>
      )}



      <main id="zc-main-content" tabIndex={-1} className="zc-content" style={{ flex: 1 }} key={unitId}>
        {activeTab === 'executar' && (
          <ExecutarView key={unitId} unit={unit} templates={templates} completions={completions} closures={closures} currentUser={currentUser} onSaveCompletion={saveCompletion} activeTypes={ACTIVE_TYPES} />
        )}
        {/* O Painel consolidado: o "agora" que era o J.I.T., o dia, a rede e o
            segmento analítico que era Relatórios, numa tela só. */}
        {activeTab === 'painel' && (
          <PainelConsolidado
            unit={unit} templates={templates} completions={completions} closures={closures}
            canSeeAllUnits={canSwitchUnit} currentUser={currentUser} users={users} activeTypes={ACTIVE_TYPES}
            jit={jit} actionPlans={actionPlans} plansLoaded={plansLoaded}
            allUnitsSelected={unitId == null} onReview={reviewCompletionAndSync}
            disputes={disputes} onResolveDispute={responderContestacao}
            onCreatePlan={handleCreatePlan} onCompletePlan={handleCompletePlan}
            onNavigate={(targetUnitId, targetTab) => {
              if (targetUnitId && canSwitchUnit) setUnitId(targetUnitId);
              if (targetTab && allowedTabs.includes(targetTab)) setTab(targetTab);
            }}
          />
        )}
        {activeTab === 'id' && <OperationalIdView targetUser={currentUser} viewer={currentUser} completions={completions || []} templates={templates || []} accent={unit.color} onChangePhoto={() => setShowAvatarPicker(true)} briefing={briefing} onOpenBriefing={() => setShowBriefing(true)} />}
        {activeTab === 'unidades' && (
          <UnidadesView
            units={ACTIVE_UNITS} templates={templates} completions={completions || []}
            closures={closures} currentUser={currentUser} canSeeAllUnits={canSwitchUnit}
            accent={unit.color}
            onBack={() => setTab('painel')}
          />
        )}
        {activeTab === 'equipe' && <EquipeView currentUser={currentUser} users={users || []} completions={completions || []} templates={templates || []} closures={closures || []} accent={unit.color} canSeeAllUnits={canSwitchUnit} />}
        {activeTab === 'gerenciar' && (
          <GerenciarView key={unitId} unit={unit} templates={templates} onSaveTemplates={saveTemplates}
            closures={closures} onSaveClosures={saveClosures} canSeeAllUnits={canSwitchUnit}
            /* Usuários vive DENTRO de Gerenciar no celular: a barra inferior não
               cabia Usuários e J.I.T. juntos, e o J.I.T. é de uso diário. No
               desktop o rail continua tendo os dois — a sub-aba some por CSS. */
            usersPanel={allowedTabs.includes('usuarios') ? (
              <UsersView users={users} onSaveUsers={saveUsers} currentUser={currentUser}
                onGenerateTestData={generateTestData} generatingTestData={generatingTestData}
                testDataResult={testDataResult} />
            ) : null}
            checklistTypes={dynamicTypes} activeTypes={ACTIVE_TYPES} allUnits={ACTIVE_UNITS} company={company}
            onSaveUnit={async u => { await import('../../lib/sync').then(m => m.saveUnit(u)); setDynamicUnits(prev => { const exists = prev.find(x => x.id === u.id); return exists ? prev.map(x => x.id === u.id ? { ...x, ...u } : x) : [...prev, { ...u, sectors: [] }]; }); }}
            onSaveSector={async s => { await import('../../lib/sync').then(m => m.saveSector(s)); setDynamicSectors(prev => [...prev.filter(x => x.id !== s.id), s]); setDynamicUnits(prev => prev.map(u => u.id === s.unitId ? { ...u, sectors: [...(u.sectors || []).filter(x => x !== s.name), s.name] } : u)); }}
            onSaveChecklistType={async t => { await import('../../lib/sync').then(m => m.saveChecklistType(t)); setDynamicTypes(prev => [...prev.filter(x => x.id !== t.id), t]); }}
            onDeleteChecklistType={async id => { await import('../../lib/sync').then(m => m.deleteChecklistType(id)); setDynamicTypes(prev => prev.filter(t => t.id !== id)); }}
            onDeleteSector={async sec => {
              await import('../../lib/sync').then(m => m.deleteSector(sec.id));
              setDynamicSectors(prev => prev.filter(x => x.id !== sec.id));
              setDynamicUnits(prev => prev.map(u => u.id === (sec.unit_id || sec.unitId)
                ? { ...u, sectors: (u.sectors || []).filter(nome => nome !== sec.name) } : u));
            }}
            onReloadTemplates={async () => { const m = await import('../../lib/sync'); const tpl = await m.fetchTemplates([]); setTemplates(tpl); }}
            onDeleteUnit={async id => { await import('../../lib/sync').then(m => m.deleteUnit(id)); setDynamicUnits(prev => prev.filter(u => u.id !== id)); if (unitId === id) setUnitId(null); }}
            onSaveCompany={async patch => {
              await import('../../lib/sync').then(m => m.saveCompany({ id: company.id, ...patch }));
              setCompany(c => ({ ...(c || {}),
                ...(patch.logoUrl !== undefined ? { logo_url: patch.logoUrl } : {}),
                ...(patch.primaryColor !== undefined ? { primary_color: patch.primaryColor } : {}) }));
            }}
          />
        )}
        {activeTab === 'usuarios' && (
          <UsersView users={users} onSaveUsers={saveUsers} currentUser={currentUser} onGenerateTestData={generateTestData} generatingTestData={generatingTestData} testDataResult={testDataResult} />
        )}
      </main>

      <BottomNav tab={activeTab} setTab={setTab} accent={unit.color} allowedTabs={allowedTabs}
        jitSignal={MANAGER_ROLES.includes(currentUser.role) && jitHasSignal && !jitSeenToday}
        idSignal={newRecognitions.length > 0} />
      </div>
    </div>
    </SectorsContext.Provider>
    </UnitsContext.Provider>
  );
}

/* --------------------- billing: paywall + nudge de trial ------------------ */

const checkoutError = (reason) => ({
  no_payer_email: 'Não encontramos o e-mail do cadastro. Fale com o suporte.',
  forbidden: 'Só a conta de gestão pode assinar.',
  unauthorized: 'Sessão expirada. Entre novamente.',
  invalid_units: 'Número de lojas inválido.',
  server_misconfigured: 'Pagamento indisponível no momento.',
  mp_error: 'Não foi possível iniciar o pagamento. Tente de novo.',
}[reason] || 'Não foi possível iniciar o pagamento. Tente de novo.');

// Painel de assinatura. mode='block' toma a tela quando o teste vence;
// mode='modal' abre por cima do app (a partir do banner/nudge).
// Preço por loja com desconto progressivo (lib/plans.js): a gestão escolhe
// quantas lojas e o ciclo; o valor aparece na hora — a mesma conta pública
// da landing, sem surpresa no checkout.
function SubscribePanel({ company, currentUser, mode = 'block', onClose, onLogout }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [units, setUnits] = useState(1);
  const [cycle, setCycle] = useState('annual'); // anual (R$97/loja) é o herói
  const isGestao = currentUser?.role === 'gestao';

  const price = priceForUnits(units, cycle);
  const annual = cycle === 'annual';
  const brl = (n) => `R$ ${n.toLocaleString('pt-BR')}`;

  const subscribe = async () => {
    setErr(''); setLoading(true);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getSessionToken() || ''}` },
        body: JSON.stringify({ units, cycle }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.ok && body.init_point) { window.location.href = body.init_point; return; }
      setErr(checkoutError(body?.reason));
    } catch { setErr('Erro de conexão. Tente novamente.'); }
    setLoading(false);
  };

  const isBlock = mode === 'block';
  const overlay = {
    position: 'fixed', inset: 0, zIndex: 10000, background: isBlock ? C.bg : 'rgba(8,20,30,0.55)',
    display: 'flex', alignItems: isBlock ? 'flex-start' : 'center', justifyContent: 'center',
    padding: isBlock ? '32px 16px' : 16, overflowY: 'auto',
  };
  const card = {
    background: 'white', borderRadius: 18, border: `1px solid ${C.border}`,
    maxWidth: 460, width: '100%', padding: 28, boxShadow: '0 12px 40px rgba(8,20,30,0.14)',
  };

  return (
    <div style={overlay}>
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Lock size={18} color={C.ink} />
            <h2 style={{ fontSize: 20, fontWeight: W.bold, color: C.ink }}>
              {isBlock ? 'Seu teste terminou' : 'Escolha seu plano'}
            </h2>
          </div>
          {!isBlock && (
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted }}>
              <X size={20} />
            </button>
          )}
        </div>
        <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 20 }}>
          {isBlock
            ? 'Assine para continuar usando o ZCheck. Seus dados estão salvos e seguros — nada foi apagado.'
            : 'Ative agora e mantenha o acesso sem interrupção quando o teste acabar.'}
        </p>

        {isGestao ? (
          <>
            {/* Plano — anual primeiro e pré-selecionado */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }} role="group" aria-label="Plano">
              {[['annual', 'Anual · R$ 97/loja · −24%'], ['monthly', 'Mensal · R$ 127/loja']].map(([id, label]) => (
                <button key={id} type="button" onClick={() => setCycle(id)} aria-pressed={cycle === id}
                  style={{ flex: 1, padding: '10px 8px', borderRadius: 10, fontSize: 13, fontWeight: W.semibold, cursor: 'pointer',
                    border: `1.5px solid ${cycle === id ? C.ink : C.border}`,
                    background: cycle === id ? C.ink : 'white', color: cycle === id ? 'white' : C.muted }}>
                  {label}
                </button>
              ))}
            </div>

            {/* Quantidade de lojas */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              border: `1.5px solid ${C.border}`, borderRadius: 12, padding: '12px 16px', marginBottom: 14 }}>
              <p style={{ fontSize: 14, fontWeight: W.semibold, color: C.ink }}>Quantas lojas?</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button type="button" aria-label="Menos uma loja" disabled={units <= 1}
                  onClick={() => setUnits(u => Math.max(1, u - 1))}
                  style={{ width: 34, height: 34, borderRadius: 8, border: `1.5px solid ${C.border}`, background: 'white',
                    fontSize: 18, fontWeight: W.semibold, color: units <= 1 ? C.border : C.ink, cursor: units <= 1 ? 'default' : 'pointer' }}>−</button>
                <span style={{ fontSize: 18, fontWeight: W.semibold, color: C.ink, minWidth: 26, textAlign: 'center' }}>{units}</span>
                <button type="button" aria-label="Mais uma loja" disabled={units >= MAX_SELF_SERVICE_UNITS}
                  onClick={() => setUnits(u => Math.min(MAX_SELF_SERVICE_UNITS, u + 1))}
                  style={{ width: 34, height: 34, borderRadius: 8, border: `1.5px solid ${C.border}`, background: 'white',
                    fontSize: 18, fontWeight: W.semibold, color: units >= MAX_SELF_SERVICE_UNITS ? C.border : C.ink,
                    cursor: units >= MAX_SELF_SERVICE_UNITS ? 'default' : 'pointer' }}>+</button>
              </div>
            </div>

            {/* Conta transparente + assinar */}
            {price && (
              <div aria-live="polite" style={{ textAlign: 'center', marginBottom: 14 }}>
                <p style={{ fontSize: 22, fontWeight: W.bold, color: C.ink }}>
                  {brl(price.monthlyCharge)}<span style={{ fontSize: 12, fontWeight: W.semibold, color: C.muted }}>/mês</span>
                </p>
                <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                  {units} {units === 1 ? 'loja' : 'lojas'} × {brl(price.perUnit)}
                  {annual
                    ? <> · 12 meses no cartão · economia de {brl(price.savingsPerYear)}/ano</>
                    : <> · sem fidelidade, cancele quando quiser</>}
                </p>
                {annual && (
                  <p style={{ display: 'flex', alignItems: 'flex-start', gap: 5, fontSize: 11.5, fontWeight: W.semibold, color: C.success, marginTop: 6 }}>
                    <Check size={13} aria-hidden style={{ flexShrink: 0, marginTop: 1 }} /> Implantação assistida incluída — nossa equipe configura com você.
                  </p>
                )}
              </div>
            )}
            <button onClick={subscribe} disabled={loading}
              style={{ width: '100%', padding: '13px', borderRadius: 10, border: 'none', fontWeight: W.semibold, fontSize: 15,
                color: 'white', background: loading ? C.muted : C.ink, cursor: loading ? 'not-allowed' : 'pointer' }}>
              {loading ? 'Abrindo pagamento...' : 'Assinar'}
            </button>
            {err && <p style={{ fontSize: 13, fontWeight: W.semibold, color: C.critical, textAlign: 'center', marginTop: 12 }}>{err}</p>}
            <p style={{ fontSize: 11, color: C.muted, textAlign: 'center', marginTop: 16 }}>
              Cancele quando quiser, sem multa ou fidelidade no mensal.
            </p>
          </>
        ) : (
          <div style={{ background: '#FFF7ED', border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
            <p style={{ fontSize: 14, color: C.ink, lineHeight: 1.6 }}>
              Peça ao <strong>gestor da conta</strong> para ativar a assinatura e liberar o acesso.
            </p>
          </div>
        )}

        {isBlock && (
          <button onClick={onLogout}
            style={{ width: '100%', marginTop: 20, padding: '12px', borderRadius: 10, border: `1.5px solid ${C.border}`,
              background: 'white', color: C.muted, fontWeight: W.semibold, fontSize: 13, cursor: 'pointer' }}>
            Sair
          </button>
        )}
      </div>
    </div>
  );
}

// Nudge dispensável durante o teste — lembra o fim do trial sem bloquear.
function TrialNudge({ daysLeft, onDismiss, onOpen }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(8,20,30,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${C.border}`, maxWidth: 380, width: '100%', padding: 24, textAlign: 'center' }}>
        <Hourglass size={34} color={C.warning} strokeWidth={1.5} aria-hidden style={{ margin: '0 auto 10px' }} />
        <h3 style={{ fontSize: 18, fontWeight: W.semibold, color: C.ink, marginBottom: 6 }}>
          {daysLeft > 0 ? `${daysLeft} ${daysLeft === 1 ? 'dia' : 'dias'} de teste` : 'Seu teste está acabando'}
        </h3>
        <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 20 }}>
          Assine para não perder o acesso nem os dados da sua operação quando o teste terminar.
        </p>
        <button onClick={onOpen}
          style={{ width: '100%', padding: '13px', borderRadius: 10, border: 'none', fontWeight: W.semibold, fontSize: 14, color: 'white', background: C.ink, cursor: 'pointer', marginBottom: 8 }}>
          Ver planos
        </button>
        <button onClick={onDismiss}
          style={{ width: '100%', padding: '10px', borderRadius: 10, border: 'none', background: 'none', color: C.muted, fontWeight: W.semibold, fontSize: 13, cursor: 'pointer' }}>
          Agora não
        </button>
      </div>
    </div>
  );
}

/* --------------------- onboarding guiado do 1º acesso --------------------- */

const ONB_SEGMENTS = {
  restaurante: { label: 'Restaurante', units: ['Loja Principal'], sectors: ['Salão', 'Cozinha', 'Caixa'], types: ['Abertura', 'Intermediário', 'Fechamento'] },
  cafe:        { label: 'Café / Bar',  units: ['Unidade 1'],     sectors: ['Salão', 'Bar', 'Caixa'], types: ['Abertura', 'Intermediário', 'Fechamento'] },
  hotel:       { label: 'Hotel / Pousada', units: ['Hotel'],     sectors: ['Recepção', 'Governança', 'Manutenção', 'Alimentos & Bebidas'], types: ['Abertura', 'Intermediário', 'Fechamento', 'Vistoria'] },
  varejo:      { label: 'Varejo / Loja', units: ['Loja 1'],      sectors: ['Piso de Vendas', 'Estoque', 'Caixa'], types: ['Abertura', 'Conferência', 'Fechamento'] },
  padaria:     { label: 'Padaria',     units: ['Padaria'],       sectors: ['Atendimento', 'Produção', 'Caixa'], types: ['Abertura', 'Produção Diária', 'Fechamento'] },
  personalizado: { label: 'Personalizado', units: ['Unidade 1'], sectors: [], types: ['Abertura', 'Fechamento'] },
};
const ONB_COLORS = ['#063C5C', '#1A6B4A', C.warning, '#7B3FA0', '#B5451B', '#1E7A6E', '#8B4513', '#2C5F8A'];
const nid = () => Math.random().toString(36).slice(2, 10);
const ONB_STEPS = ['Segmento', 'Lojas', 'Setores', 'Checklists', 'Marca'];

// Indicador de passo do wizard. Existia só no /comecar (arquivo separado); o
// OnboardingWizard o referenciava sem que estivesse definido aqui, o que
// derrubava o app com "Can't find variable: Step" logo após o login.
function Step({ n, label, active, done }) {
  return (
    <div className="flex flex-col items-center gap-1" style={{ flex: 1, minWidth: 0 }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: W.semibold, fontSize: 12,
        background: done ? C.success : active ? C.ink : C.border,
        color: done || active ? 'white' : C.muted, transition: 'all 0.2s',
      }}>
        {done ? <Check size={14} strokeWidth={3} aria-label="concluído" /> : n}
      </div>
      <span style={{ fontSize: 8, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.04em', color: active ? C.ink : C.muted, textAlign: 'center' }}>{label}</span>
    </div>
  );
}

// Onboarding do primeiro acesso: o gestor configura a operação (lojas, setores,
// tipos de checklist), sobe o logo e escolhe a cor. Ao concluir, grava tudo e
// marca companies.onboarded_at — a partir daí o app abre normalmente.
function OnboardingWizard({ company, currentUser, onLogout, onDone }) {
  // Rascunho em disco. O wizard vive num estado só de memória, e no celular o
  // sistema descarta a aba do PWA a qualquer momento (é o mesmo motivo da sessão
  // persistida em lib/supabase.js): quem tinha digitado três lojas voltava para
  // o passo 1 com uma linha em branco e reconfigurava só o que ainda lembrava —
  // as outras lojas nunca chegavam ao banco. Agora cada passo é gravado local e
  // a volta cai onde parou. A chave é por empresa; some ao concluir.
  const draftKey = `zc_onb_rascunho_${company?.id || 'sem-empresa'}`;
  const draft = useMemo(() => {
    try { return JSON.parse(localStorage.getItem(draftKey) || 'null') || null; }
    catch (_) { return null; }
  }, [draftKey]);

  const [step, setStep] = useState(draft?.step || 1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [segment, setSegment] = useState(draft?.segment || '');
  const [primaryColor, setPrimaryColor] = useState(draft?.primaryColor || company?.primary_color || '#063C5C');
  const [units, setUnits] = useState(draft?.units?.length ? draft.units : [{ id: nid(), name: '', color: '#063C5C' }]);
  const [sectors, setSectors] = useState(draft?.sectors || []);
  const [types, setTypes] = useState(draft?.types?.length ? draft.types
    : [{ id: nid(), name: 'Abertura' }, { id: nid(), name: 'Fechamento' }]);
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [skipLogo, setSkipLogo] = useState(false);

  // O logo fica de fora do rascunho de propósito: é um File, não serializa.
  useEffect(() => {
    try {
      localStorage.setItem(draftKey, JSON.stringify({ step, segment, primaryColor, units, sectors, types }));
    } catch (_) { /* cota cheia / modo privado: segue só em memória */ }
  }, [draftKey, step, segment, primaryColor, units, sectors, types]);

  // Voltar ao passo 1 e tocar num segmento REESCREVIA lojas, setores e tipos já
  // preenchidos, sem avisar — quem voltasse só para conferir o segmento perdia o
  // que tinha digitado nos passos seguintes. Só sobrescreve o que ainda está
  // igual ao modelo (ou vazio); com trabalho por cima, pergunta antes.
  const applySegment = (seg) => {
    const t = ONB_SEGMENTS[seg]; if (!t) { setSegment(seg); return; }
    const modeloAtual = ONB_SEGMENTS[segment];
    const nomes = (arr) => arr.filter(x => x.name.trim()).map(x => x.name.trim()).join('|');
    const intacto = !segment
      ? !nomes(units) && !nomes(sectors)
      : nomes(units) === (modeloAtual?.units.length ? modeloAtual.units : ['Unidade 1']).join('|')
        && nomes(sectors) === modeloAtual?.sectors.join('|')
        && nomes(types) === (modeloAtual?.types.length ? modeloAtual.types : ['Abertura', 'Fechamento']).join('|');
    if (!intacto && !confirm('Trocar o segmento substitui as lojas, setores e tipos que você já preencheu. Continuar?')) return;

    setSegment(seg);
    const us = (t.units.length ? t.units : ['Unidade 1']).map(n => ({ id: nid(), name: n, color: primaryColor }));
    setUnits(us);
    setSectors(t.sectors.map(s => ({ id: nid(), name: s, unitId: us[0].id })));
    setTypes((t.types.length ? t.types : ['Abertura', 'Fechamento']).map(n => ({ id: nid(), name: n })));
  };

  const onPickLogo = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    setSkipLogo(false);
    setLogoFile(f);
    const r = new FileReader(); r.onload = () => setLogoPreview(r.result); r.readAsDataURL(f);
  };

  const next = () => {
    setError('');
    if (step === 1 && !segment) { setError('Escolha um segmento para começar.'); return; }
    if (step === 2 && !units.some(u => u.name.trim())) { setError('Adicione ao menos uma loja.'); return; }
    // Linha sem nome era descartada no fim, calada: o gestor via três lojas na
    // tela e o app abria com uma. Ou nomeia, ou tira do caminho.
    if (step === 2 && units.some(u => !u.name.trim())) { setError('Dê um nome a todas as lojas — ou remova as linhas em branco no ×.'); return; }
    if (step === 3 && sectors.some(s => !s.name.trim())) { setError('Dê um nome a todos os setores — ou remova as linhas em branco no ×.'); return; }
    if (step === 4 && !types.some(t => t.name.trim())) { setError('Adicione ao menos um tipo de checklist.'); return; }
    if (step === 4 && types.some(t => !t.name.trim())) { setError('Dê um nome a todos os tipos — ou remova as linhas em branco no ×.'); return; }
    if (step === 5) { finish(); return; }
    setStep(s => s + 1);
  };

  const finish = async () => {
    setSaving(true); setError('');
    try {
      const cid = company.id;
      const now = new Date().toISOString();
      const m = await import('../../lib/sync');

      const unitRows = units.filter(u => u.name.trim()).map((u, i) => ({ id: u.id, name: u.name.trim(), color: u.color, sortOrder: i }));
      for (const u of unitRows) await m.saveUnit({ id: u.id, companyId: cid, name: u.name, color: u.color, sortOrder: u.sortOrder });

      // Confere no BANCO o que acabou de ser gravado, antes de marcar a empresa
      // como configurada. As lojas são a espinha da operação: se alguma não
      // chegou, o certo é o gestor continuar no wizard (com tudo preenchido) e
      // tentar de novo — não abrir o app com metade da rede faltando.
      const gravadas = await m.fetchUnitsStrict(cid);
      const faltando = unitRows.filter(u => !gravadas.some(g => g.id === u.id));
      if (faltando.length) {
        throw new Error(`${faltando.map(u => u.name).join(', ')} não chegou ao servidor`);
      }

      const sectorRows = sectors.filter(s => s.name.trim()).map((s, i) => ({ id: s.id, unitId: s.unitId || unitRows[0]?.id, name: s.name.trim(), sortOrder: i }));
      for (const s of sectorRows) await m.saveSector({ id: s.id, companyId: cid, unitId: s.unitId, name: s.name, sortOrder: s.sortOrder });

      const typeRows = types.filter(t => t.name.trim()).map((t, i) => ({ id: t.id, name: t.name.trim(), sortOrder: i }));
      for (const t of typeRows) await m.saveChecklistType({ id: t.id, companyId: cid, name: t.name, sortOrder: t.sortOrder });

      let logoUrl;
      if (logoFile) {
        try { logoUrl = await m.uploadCompanyLogo(cid, logoFile); }
        catch (e) { console.warn('upload do logo falhou (segue sem logo):', e.message); }
      }
      await m.saveCompany({ id: cid, primaryColor, logoUrl, onboardedAt: now });

      // Rascunho cumpriu o papel: a configuração está no banco.
      try { localStorage.removeItem(draftKey); } catch (_) {}

      onDone({
        patch: { onboarded_at: now, primary_color: primaryColor, logo_url: logoUrl ?? company.logo_url ?? null },
        // As lojas saem da leitura do banco, não do que ficou na tela: é a
        // versão que a equipe vai ver no próximo login (com fuso e ordem reais).
        units: gravadas.map(g => ({ id: g.id, name: g.name, color: g.color, timezone: g.timezone })),
        sectors: sectorRows, types: typeRows,
      });
    } catch (e) {
      console.error('onboarding finish falhou:', e);
      setError(`Não foi possível salvar${e?.message ? ` (${e.message})` : ''}. Tente novamente.`);
      setSaving(false);
    }
  };

  const fieldRow = { display: 'flex', alignItems: 'center', gap: 8 };
  const inputStyle = { flex: 1, minWidth: 0, fontSize: 14, fontWeight: W.semibold, color: C.ink, background: 'white', padding: '12px 14px', border: `1.5px solid ${C.border}`, borderRadius: 10, outline: 'none', fontFamily: 'inherit' };
  const addBtn = { width: '100%', padding: '12px', borderRadius: 10, border: `2px dashed ${C.border}`, fontWeight: W.semibold, color: C.muted, background: 'none', cursor: 'pointer', fontSize: 14 };
  const rm = (setter) => (id) => setter(prev => prev.length > 1 ? prev.filter(x => x.id !== id) : prev);

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: "'Inter', system-ui, sans-serif", overflowX: 'hidden' }}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '28px 20px 96px', width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <h1 style={{ fontSize: 22, fontWeight: W.bold, color: C.ink }}>Bem-vindo, {currentUser.name.split(' ')[0]}</h1>
          <p style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>Vamos configurar <strong>{company.name}</strong> em poucos passos.</p>
        </div>

        <div className="flex items-start justify-between" style={{ marginBottom: 24, gap: 4 }}>
          {ONB_STEPS.map((label, i) => (
            <Step key={i} n={i + 1} label={label} active={step === i + 1} done={step > i + 1} />
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <h2 style={{ fontSize: 19, fontWeight: W.semibold, color: C.ink, marginBottom: 4 }}>Qual o seu segmento?</h2>
            <p style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>Pré-carregamos lojas, setores e checklists típicos — você ajusta tudo nos próximos passos.</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(ONB_SEGMENTS).map(([id, t]) => (
                <button key={id} onClick={() => applySegment(id)}
                  style={{ padding: '10px 16px', borderRadius: 20, fontWeight: W.semibold, fontSize: 13, cursor: 'pointer',
                    background: segment === id ? C.ink : 'white', color: segment === id ? 'white' : C.muted,
                    border: `1.5px solid ${segment === id ? C.ink : C.border}` }}>{t.label}</button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 style={{ fontSize: 19, fontWeight: W.semibold, color: C.ink, marginBottom: 4 }}>Suas lojas / unidades</h2>
            <p style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>Cada loja ou unidade operacional que você acompanha.</p>
            <div className="space-y-3">
              {units.map((u, i) => (
                <div key={u.id} style={fieldRow}>
                  <input type="color" value={u.color} onChange={e => setUnits(prev => prev.map(x => x.id === u.id ? { ...x, color: e.target.value } : x))}
                    style={{ width: 42, height: 42, borderRadius: 8, border: `1.5px solid ${C.border}`, cursor: 'pointer', padding: 2, flexShrink: 0 }} />
                  <input value={u.name} onChange={e => setUnits(prev => prev.map(x => x.id === u.id ? { ...x, name: e.target.value } : x))} placeholder={`Loja ${i + 1}`} style={inputStyle} />
                  {units.length > 1 && <button onClick={() => rm(setUnits)(u.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 18 }}>×</button>}
                </div>
              ))}
            </div>
            <button onClick={() => setUnits(p => [...p, { id: nid(), name: '', color: primaryColor }])} style={addBtn}>+ Adicionar loja</button>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 style={{ fontSize: 19, fontWeight: W.semibold, color: C.ink, marginBottom: 4 }}>Setores</h2>
            <p style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>As áreas da operação (ex: Salão, Cozinha, Recepção). Opcional.</p>
            <div className="space-y-3">
              {sectors.map((s, i) => (
                <div key={s.id} style={fieldRow}>
                  {units.filter(u => u.name.trim()).length > 1 && (
                    <select value={s.unitId || ''} onChange={e => setSectors(prev => prev.map(x => x.id === s.id ? { ...x, unitId: e.target.value } : x))}
                      style={{ fontSize: 12, fontWeight: W.semibold, color: C.ink, background: 'white', padding: '12px 8px', border: `1.5px solid ${C.border}`, borderRadius: 8, flexShrink: 0 }}>
                      {units.filter(u => u.name.trim()).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  )}
                  <input value={s.name} onChange={e => setSectors(prev => prev.map(x => x.id === s.id ? { ...x, name: e.target.value } : x))} placeholder={`Setor ${i + 1}`} style={inputStyle} />
                  <button onClick={() => setSectors(prev => prev.filter(x => x.id !== s.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 18 }}>×</button>
                </div>
              ))}
            </div>
            <button onClick={() => setSectors(p => [...p, { id: nid(), name: '', unitId: units.filter(u => u.name.trim())[0]?.id }])} style={addBtn}>+ Adicionar setor</button>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h2 style={{ fontSize: 19, fontWeight: W.semibold, color: C.ink, marginBottom: 4 }}>Tipos de checklist</h2>
            <p style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>Ex: Abertura, Fechamento, Vistoria. Você cria os itens de cada um depois, em Gerenciar.</p>
            <div className="space-y-3">
              {types.map((t, i) => (
                <div key={t.id} style={fieldRow}>
                  <input value={t.name} onChange={e => setTypes(prev => prev.map(x => x.id === t.id ? { ...x, name: e.target.value } : x))} placeholder={`Tipo ${i + 1}`} style={inputStyle} />
                  {types.length > 1 && <button onClick={() => rm(setTypes)(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 18 }}>×</button>}
                </div>
              ))}
            </div>
            <button onClick={() => setTypes(p => [...p, { id: nid(), name: '' }])} style={addBtn}>+ Adicionar tipo</button>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <h2 style={{ fontSize: 19, fontWeight: W.semibold, color: C.ink, marginBottom: 4 }}>Marca da empresa</h2>
            <p style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>Seu logo e a cor aparecem no app para a equipe.</p>
            <div>
              <p style={{ fontSize: 11, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted, marginBottom: 8 }}>Logotipo</p>
              {!skipLogo && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ width: 72, height: 72, borderRadius: 12, border: `1.5px solid ${C.border}`, background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                      {logoPreview ? <img src={logoPreview} alt="logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} /> : <span style={{ fontSize: 11, color: C.muted }}>sem logo</span>}
                    </div>
                    <label style={{ padding: '10px 16px', borderRadius: 10, border: `1.5px solid ${C.border}`, background: 'white', color: C.ink, fontWeight: W.semibold, fontSize: 13, cursor: 'pointer' }}>
                      {logoFile ? 'Trocar imagem' : 'Escolher imagem'}
                      <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onPickLogo} style={{ display: 'none' }} />
                    </label>
                  </div>
                  <p style={{ fontSize: 11, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>
                    PNG, JPG ou WebP. Recomendado <strong>quadrado, ~512×512 px</strong> (até 2&nbsp;MB).
                  </p>
                </>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, cursor: 'pointer' }}>
                <input type="checkbox" checked={skipLogo}
                  onChange={e => { setSkipLogo(e.target.checked); if (e.target.checked) { setLogoFile(null); setLogoPreview(null); } }}
                  style={{ width: 18, height: 18, accentColor: C.ink, cursor: 'pointer' }} />
                <span style={{ fontSize: 13, color: C.ink }}>Continuar sem logotipo (adiciono depois)</span>
              </label>
            </div>
            <div>
              <p style={{ fontSize: 11, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted, marginBottom: 8, marginTop: 8 }}>Cor principal</p>
              <div className="flex flex-wrap gap-2">
                {ONB_COLORS.map(c => (
                  <button key={c} onClick={() => setPrimaryColor(c)}
                    style={{ width: 36, height: 36, borderRadius: '50%', background: c, border: primaryColor === c ? `3px solid ${C.ink}` : '3px solid transparent', cursor: 'pointer', outline: primaryColor === c ? '2px solid white' : 'none', outlineOffset: -4 }} />
                ))}
              </div>
            </div>
          </div>
        )}

        {error && <p style={{ fontSize: 13, fontWeight: W.semibold, color: C.critical, marginTop: 16, textAlign: 'center' }}>{error}</p>}

        <div className="flex gap-3" style={{ marginTop: 30 }}>
          {step > 1 && !saving && (
            <button onClick={() => { setError(''); setStep(s => s - 1); }}
              style={{ flex: 1, padding: '14px', borderRadius: 12, border: `1.5px solid ${C.border}`, fontWeight: W.semibold, color: C.ink, background: 'white', cursor: 'pointer', fontSize: 15 }}>← Voltar</button>
          )}
          <button onClick={next} disabled={saving}
            style={{ flex: 2, padding: '14px', borderRadius: 12, border: 'none', fontWeight: W.semibold, color: 'white', background: saving ? C.muted : C.ink, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 15 }}>
            {saving ? 'Salvando...' : step === 5 ? 'Concluir configuração →' : 'Próximo →'}
          </button>
        </div>

        <p style={{ fontSize: 11, color: C.muted, textAlign: 'center', marginTop: 20 }}>
          <button onClick={onLogout} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', textDecoration: 'underline', fontSize: 11 }}>Sair</button>
        </p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppInner />
      <ToastHost />
    </ErrorBoundary>
  );
}
