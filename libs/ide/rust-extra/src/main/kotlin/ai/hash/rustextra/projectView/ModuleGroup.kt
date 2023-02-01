package ai.hash.rustextra.projectView

import com.intellij.ide.projectView.TreeStructureProvider
import com.intellij.ide.projectView.ViewSettings
import com.intellij.ide.projectView.impl.nodes.PsiDirectoryNode
import com.intellij.ide.projectView.impl.nodes.PsiFileNode
import com.intellij.ide.util.treeView.AbstractTreeNode
import com.intellij.openapi.fileTypes.LanguageFileType
import com.intellij.openapi.project.DumbAware
import org.rust.lang.core.psi.RsFile

class ModuleGroup : TreeStructureProvider, DumbAware {
    override fun modify(
        parent: AbstractTreeNode<*>,
        children: MutableCollection<AbstractTreeNode<*>>,
        settings: ViewSettings?
    ): MutableCollection<AbstractTreeNode<*>> {
        val nodes = ArrayList<AbstractTreeNode<*>>();

        val directories = HashMap<String, ModuleDirectoryNode>();

        for (child in children) {
            if (child is PsiDirectoryNode) {
                val file = child.virtualFile;

                if (file != null && file.isDirectory) {
                    directories[file.name] = ModuleDirectoryNode.fromPsiFileNode(child);
                }
            }
        }

        for (child in children) {
            if (child is ModuleFileNode) {
                // the file has already been processed, therefore to not recurse endlessly we end prematurely
                nodes.add(child);
                continue;
            }

            val value = child.value;
            if (child is PsiFileNode && value is RsFile) {
                val directory = directories[value.virtualFile.nameWithoutExtension];
                if (directory != null) {
                    // highlight the file
                    directory.addPrepend(ModuleFileNode.fromPsiFileNode(child, settings));

                    continue
                }
            }

            if (child is PsiDirectoryNode) {
                val file = child.virtualFile;

                if (file != null && file.isDirectory) {
                    val directory = directories[file.name];
                    if (directory != null) {
                        nodes.add(directory)
                    };
                }

                continue
            }

            nodes.add(child);
        }

        return nodes;
    }
}